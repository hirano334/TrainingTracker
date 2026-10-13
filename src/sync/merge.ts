import { KEY_OF, TABLES, type AppData, type SyncMeta, type TableName } from '../domain/types'

export function emptyData(): AppData {
  return { settings: [], phases: [], dailyLogs: [], waistLogs: [], topSets: [], checkpoints: [], cycles: [] }
}

export interface MergeResult {
  merged: AppData
  /** local に無い、または local より新しいレコードが remote にあった */
  localChanged: boolean
  /** remote に無い、または remote より新しいレコードが local にあった */
  remoteChanged: boolean
}

function mergeTable<T extends SyncMeta>(
  local: T[],
  remote: T[],
  key: keyof T,
): { rows: T[]; localChanged: boolean; remoteChanged: boolean } {
  const byKey = new Map<unknown, T>()
  for (const r of local) byKey.set(r[key], r)
  let localChanged = false
  const fromRemote = new Set<unknown>()
  for (const r of remote) {
    const mine = byKey.get(r[key])
    // 同時刻なら端末側を残す
    if (!mine || r.updatedAt > mine.updatedAt) {
      byKey.set(r[key], r)
      fromRemote.add(r[key])
      localChanged = true
    }
  }
  const remoteByKey = new Map<unknown, T>()
  for (const r of remote) remoteByKey.set(r[key], r)
  let remoteChanged = false
  for (const [k, row] of byKey) {
    if (fromRemote.has(k)) continue
    const theirs = remoteByKey.get(k)
    if (!theirs || row.updatedAt > theirs.updatedAt) remoteChanged = true
  }
  return { rows: [...byKey.values()], localChanged, remoteChanged }
}

/**
 * レコード単位で updatedAt の新しい方を採る。削除も deleted フラグ付きのレコードとして
 * 同じ規則で扱うので、片方で消したものがもう片方から復活することはない。
 */
export function mergeData(local: AppData, remote: Partial<AppData>): MergeResult {
  const merged = emptyData()
  let localChanged = false
  let remoteChanged = false
  for (const t of TABLES) {
    const r = mergeTable<SyncMeta>(
      local[t] as SyncMeta[],
      (remote[t] ?? []) as SyncMeta[],
      KEY_OF[t] as keyof SyncMeta,
    )
    ;(merged as Record<TableName, SyncMeta[]>)[t] = r.rows
    localChanged ||= r.localChanged
    remoteChanged ||= r.remoteChanged
  }
  return { merged, localChanged, remoteChanged }
}
