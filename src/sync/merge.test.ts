import { describe, expect, it } from 'vitest'
import type { AppData, DailyLog } from '../domain/types'
import { emptyData, mergeData } from './merge'

const log = (date: string, weight: number, updatedAt: number, deleted = false): DailyLog => ({
  date,
  weight,
  bodyFatPct: null,
  kcal: null,
  proteinG: null,
  updatedAt,
  ...(deleted ? { deleted } : {}),
})
const data = (...dailyLogs: DailyLog[]): AppData => ({ ...emptyData(), dailyLogs })
const weights = (d: AppData) =>
  Object.fromEntries(d.dailyLogs.map((l) => [l.date, l.deleted ? 'deleted' : l.weight]))

describe('mergeData', () => {
  it('片方だけにあるレコードは両方に行き渡る', () => {
    const r = mergeData(data(log('2026-12-01', 72.5, 10)), data(log('2026-12-02', 72.7, 11)))
    expect(weights(r.merged)).toEqual({ '2026-12-01': 72.5, '2026-12-02': 72.7 })
    expect(r.localChanged).toBe(true)
    expect(r.remoteChanged).toBe(true)
  })
  it('両方で編集したら新しい方', () => {
    const a = mergeData(data(log('2026-12-01', 72.5, 10)), data(log('2026-12-01', 72.9, 20)))
    expect(weights(a.merged)).toEqual({ '2026-12-01': 72.9 })
    expect([a.localChanged, a.remoteChanged]).toEqual([true, false])

    const b = mergeData(data(log('2026-12-01', 72.5, 30)), data(log('2026-12-01', 72.9, 20)))
    expect(weights(b.merged)).toEqual({ '2026-12-01': 72.5 })
    expect([b.localChanged, b.remoteChanged]).toEqual([false, true])
  })
  it('片方で削除したものは復活しない', () => {
    const r = mergeData(data(log('2026-12-01', 72.5, 20, true)), data(log('2026-12-01', 72.5, 10)))
    expect(weights(r.merged)).toEqual({ '2026-12-01': 'deleted' })
    expect(r.remoteChanged).toBe(true)
  })
  it('削除後に入れ直したら入れ直した方が残る', () => {
    const r = mergeData(data(log('2026-12-01', 72.5, 20, true)), data(log('2026-12-01', 73.0, 30)))
    expect(weights(r.merged)).toEqual({ '2026-12-01': 73.0 })
  })
  it('同じ内容なら変更なし', () => {
    const d = data(log('2026-12-01', 72.5, 10))
    const r = mergeData(d, d)
    expect([r.localChanged, r.remoteChanged]).toEqual([false, false])
  })
  it('順番を入れ替えても結果は同じ', () => {
    const a = data(log('2026-12-01', 72.5, 10), log('2026-12-02', 72.6, 5))
    const b = data(log('2026-12-01', 72.9, 20), log('2026-12-03', 72.8, 7))
    expect(weights(mergeData(a, b).merged)).toEqual(weights(mergeData(b, a).merged))
  })
  it('空のファイルや欠けたテーブルでも落ちない', () => {
    const r = mergeData(data(log('2026-12-01', 72.5, 10)), {})
    expect(weights(r.merged)).toEqual({ '2026-12-01': 72.5 })
    expect(r.remoteChanged).toBe(true)
  })
})
