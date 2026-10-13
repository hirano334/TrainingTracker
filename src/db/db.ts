import Dexie, { type EntityTable, type Table } from 'dexie'
import { DEFAULT_PHASES, DEFAULT_SETTINGS } from '../domain/defaults'
import {
  TABLES,
  type AppData,
  type Checkpoint,
  type DailyLog,
  type Phase,
  type Settings,
  type SyncMeta,
  type TableName,
  type TopSet,
  type WaistLog,
} from '../domain/types'

/** 端末ごとの状態。同期・バックアップの対象外 */
export interface Meta {
  key: string
  value: unknown
}

export class TrackerDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  phases!: EntityTable<Phase, 'id'>
  dailyLogs!: EntityTable<DailyLog, 'date'>
  waistLogs!: EntityTable<WaistLog, 'date'>
  topSets!: EntityTable<TopSet, 'id'>
  checkpoints!: EntityTable<Checkpoint, 'date'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'cycle-tracker') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      phases: 'id',
      dailyLogs: 'date',
      waistLogs: 'date',
      topSets: 'id, date',
      checkpoints: 'date',
      meta: 'key',
    })
    this.on('populate', (tx) => {
      tx.table('settings').add(DEFAULT_SETTINGS)
      tx.table('phases').bulkAdd(DEFAULT_PHASES)
    })
  }
}

export const db = new TrackerDB()

/** データが変わったことを同期側に知らせる */
const listeners = new Set<() => void>()
export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  for (const fn of listeners) fn()
}

function table(d: TrackerDB, name: TableName): Table<SyncMeta> {
  return d.table(name)
}

/** 追加・上書き。updatedAt を打つ */
export async function put<K extends TableName>(
  name: K,
  row: Omit<AppData[K][number], 'updatedAt' | 'deleted'>,
  d: TrackerDB = db,
): Promise<void> {
  await table(d, name).put({ ...row, updatedAt: Date.now() } as SyncMeta)
  notify()
}

/** 削除。行は残して deleted を立てる（同期で復活させないため） */
export async function remove(name: TableName, key: string, d: TrackerDB = db): Promise<void> {
  const t = table(d, name)
  const row = await t.get(key)
  if (!row) return
  await t.put({ ...row, deleted: true, updatedAt: Date.now() })
  notify()
}

export async function readAll(d: TrackerDB = db): Promise<AppData> {
  const out = {} as Record<TableName, SyncMeta[]>
  for (const t of TABLES) out[t] = await table(d, t).toArray()
  return out as unknown as AppData
}

/**
 * 突き合わせ結果を書き込む（updatedAt は書き換えない）。
 * 読み出してから書き込むまでの間に端末側で保存された行を古い内容で潰さないよう、
 * 手元より新しい行だけを書く。
 */
export async function writeNewer(data: Partial<AppData>, d: TrackerDB = db): Promise<void> {
  await d.transaction('rw', TABLES.map((t) => table(d, t)), async () => {
    for (const t of TABLES) {
      const tbl = table(d, t)
      const pk = tbl.schema.primKey.name as keyof SyncMeta
      const mine = new Map((await tbl.toArray()).map((r) => [r[pk], r.updatedAt]))
      const rows = ((data[t] ?? []) as SyncMeta[]).filter((r) => {
        const at = mine.get(r[pk])
        return at === undefined || r.updatedAt > at
      })
      await tbl.bulkPut(rows)
    }
  })
}

/** この端末の記録を消して初期状態に戻す。Drive 上のファイルには触らない */
export async function resetLocal(d: TrackerDB = db): Promise<void> {
  await d.transaction('rw', [...TABLES.map((t) => table(d, t)), d.meta], async () => {
    for (const t of TABLES) await table(d, t).clear()
    await d.meta.clear()
    await d.settings.add(DEFAULT_SETTINGS)
    await d.phases.bulkAdd(DEFAULT_PHASES)
  })
}

export async function getMeta<T>(key: string, d: TrackerDB = db): Promise<T | undefined> {
  return (await d.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown, d: TrackerDB = db): Promise<void> {
  await d.meta.put({ key, value })
}

export function newId(): string {
  return crypto.randomUUID()
}
