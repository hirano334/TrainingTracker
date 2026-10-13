import Dexie, { type EntityTable, type Table } from 'dexie'
import { DEFAULT_CYCLE_FACTORS, DEFAULT_CYCLES, DEFAULT_PHASES, DEFAULT_SETTINGS } from '../domain/defaults'
import { findPhasePairs } from '../domain/phases'
import {
  TABLES,
  type AppData,
  type Checkpoint,
  type Cycle,
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
  cycles!: EntityTable<Cycle, 'id'>
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
    // 2: 判定の対象を、フェーズ表からの自動割り出しから「申告したサイクル」に変更。
    // それまで設定にあった基準トータルと係数を、第1サイクルとして引き継ぐ
    this.version(2)
      .stores({ cycles: 'id' })
      .upgrade(async (tx) => {
        const old = (await tx.table('settings').get('settings')) as
          | (Partial<Settings> & {
              baseTotal?: number | null
              requiredPaceFactor?: number
              projectionMultiplier?: number
            })
          | undefined
        const phases = (await tx.table('phases').toArray()) as Phase[]
        const baseDate = old?.baseDate ?? DEFAULT_CYCLES[0].baseDate
        const pair = findPhasePairs(phases).find((p) => p.bulk.endDate > baseDate)
        await tx.table('cycles').add({
          ...DEFAULT_CYCLES[0],
          updatedAt: old?.updatedAt ?? 0,
          baseDate,
          baseWeight: old?.baseWeight ?? DEFAULT_CYCLES[0].baseWeight,
          baseTotal: old?.baseTotal ?? null,
          bulkEndDate: pair?.bulk.endDate ?? DEFAULT_CYCLES[0].bulkEndDate,
          cutEndDate: pair?.cut.endDate ?? DEFAULT_CYCLES[0].cutEndDate,
          requiredPaceFactor: old?.requiredPaceFactor ?? DEFAULT_CYCLE_FACTORS.requiredPaceFactor,
          projectionMultiplier: old?.projectionMultiplier ?? DEFAULT_CYCLE_FACTORS.projectionMultiplier,
        } satisfies Cycle)
      })
    this.on('populate', (tx) => {
      tx.table('settings').add(DEFAULT_SETTINGS)
      tx.table('phases').bulkAdd(DEFAULT_PHASES)
      tx.table('cycles').bulkAdd(DEFAULT_CYCLES)
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

/** まとめて追加・上書き */
export async function putMany<K extends TableName>(
  name: K,
  rows: Omit<AppData[K][number], 'updatedAt' | 'deleted'>[],
  d: TrackerDB = db,
): Promise<void> {
  const updatedAt = Date.now()
  await table(d, name).bulkPut(rows.map((r) => ({ ...r, updatedAt }) as SyncMeta))
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
    await d.cycles.bulkAdd(DEFAULT_CYCLES)
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
