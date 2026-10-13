import { parsePayload, toPayload } from '../db/backup'
import { getMeta, onLocalChange, readAll, setMeta, writeNewer } from '../db/db'
import type { AppData } from '../domain/types'
import { createFile, DriveError, findFile, getRevision, readFile, updateFile } from './drive'
import { cachedToken, clearToken, requestToken } from './googleAuth'
import { mergeData } from './merge'

export type SyncStatus =
  /** 連携していない */
  | 'off'
  | 'idle'
  | 'syncing'
  /** トークン切れ。ボタンを押してもらう必要がある */
  | 'needsAuth'
  | 'offline'
  | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncAt: number | null
  error: string | null
}

/** 他の端末と書き込みがぶつかったときにやり直す回数 */
const MAX_ATTEMPTS = 3
/** 入力を保存してから同期を始めるまでの待ち時間 */
const DEBOUNCE_MS = 4000

/** 通信・保存の差し替え口（テスト用） */
export interface SyncIO {
  findFile(token: string): Promise<string | null>
  createFile(token: string, content: string): Promise<string>
  getRevision(token: string, fileId: string): Promise<string>
  readFile(token: string, fileId: string): Promise<string>
  updateFile(token: string, fileId: string, content: string): Promise<void>
  readLocal(): Promise<AppData>
  writeLocal(data: AppData): Promise<void>
}

const realIO: SyncIO = {
  findFile,
  createFile,
  getRevision,
  readFile,
  updateFile,
  readLocal: () => readAll(),
  writeLocal: (d) => writeNewer(d),
}

/**
 * 1回ぶんの同期。Drive のファイルを読み、端末側と突き合わせ、変わった側だけに書く。
 * 戻り値は Drive 上のファイルID。
 */
export async function syncOnce(token: string, knownFileId: string | null, io: SyncIO = realIO): Promise<string> {
  let fileId = knownFileId

  for (let attempt = 1; ; attempt++) {
    if (fileId === null) {
      const local = await io.readLocal()
      fileId = await io.findFile(token)
      if (fileId === null) return io.createFile(token, JSON.stringify(toPayload(local)))
    }

    let rev: string
    let remote: Partial<AppData>
    try {
      rev = await io.getRevision(token, fileId)
      remote = parsePayload(await io.readFile(token, fileId))
    } catch (e) {
      // 覚えていたファイルが Drive から消されていたら、探し直す
      if (e instanceof DriveError && e.status === 404 && attempt < MAX_ATTEMPTS) {
        fileId = null
        continue
      }
      throw e
    }

    const local = await io.readLocal()
    const r = mergeData(local, remote)
    if (r.localChanged) await io.writeLocal(r.merged)
    if (!r.remoteChanged) return fileId

    // 読んだ後に他の端末が書いていたら、読み直して突き合わせをやり直す
    if ((await io.getRevision(token, fileId)) !== rev) {
      if (attempt >= MAX_ATTEMPTS) throw new Error('他の端末と同時に書き込みました。もう一度同期してください')
      continue
    }
    await io.updateFile(token, fileId, JSON.stringify(toPayload(r.merged)))
    return fileId
  }
}

// ---- 画面から使う状態と操作 ----

let state: SyncState = { status: 'off', lastSyncAt: null, error: null }
const subs = new Set<() => void>()
let running: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let wired = false

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const fn of subs) fn()
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

export async function getClientId(): Promise<string> {
  return (await getMeta<string>('googleClientId')) ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
}

/**
 * 同期する。interactive は、ボタンを押した処理から呼んだときだけ true にする
 * （Google のログイン画面を開けるのはそのときだけ）。
 */
export function syncNow(interactive: boolean): Promise<void> {
  running ??= run(interactive).finally(() => {
    running = null
  })
  return running
}

async function run(interactive: boolean): Promise<void> {
  if (!(await getMeta<boolean>('syncEnabled'))) return
  if (!navigator.onLine) return set({ status: 'offline', error: null })

  let token = cachedToken()
  if (!token) {
    if (!interactive) return set({ status: 'needsAuth', error: null })
    try {
      token = await requestToken(await getClientId())
    } catch (e) {
      return set({ status: 'needsAuth', error: (e as Error).message })
    }
  }

  set({ status: 'syncing', error: null })
  try {
    const fileId = await syncOnce(token, (await getMeta<string>('driveFileId')) ?? null)
    const now = Date.now()
    await setMeta('driveFileId', fileId)
    await setMeta('lastSyncAt', now)
    set({ status: 'idle', lastSyncAt: now })
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) {
      clearToken()
      return set({ status: 'needsAuth', error: null })
    }
    set({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message })
  }
}

/** 起動時に一度呼ぶ */
export async function initSync(): Promise<void> {
  set({ lastSyncAt: (await getMeta<number>('lastSyncAt')) ?? null })
  if (!(await getMeta<boolean>('syncEnabled'))) return
  set({ status: 'needsAuth' })
  if (!wired) {
    wired = true
    onLocalChange(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow(false), DEBOUNCE_MS)
    })
    window.addEventListener('online', () => void syncNow(false))
  }
  void syncNow(false)
}

/** 連携を始める。設定画面のボタンから呼ぶ */
export async function enableSync(clientId: string): Promise<void> {
  await setMeta('googleClientId', clientId.trim())
  await setMeta('syncEnabled', true)
  await initSync()
  await syncNow(true)
}

/** 連携をやめる。端末内の記録と Drive 上のファイルはそのまま残る */
export async function disableSync(): Promise<void> {
  clearTimeout(timer)
  clearToken()
  await setMeta('syncEnabled', false)
  await setMeta('driveFileId', null)
  set({ status: 'off', error: null })
}
