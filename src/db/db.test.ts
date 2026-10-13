import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { exportJSON, importJSON, parsePayload } from './backup'
import { put, readAll, remove, resetLocal, TrackerDB } from './db'

let n = 0
const fresh = () => new TrackerDB(`test-${n++}`)
const log = (date: string, weight: number) => ({ date, weight, bodyFatPct: null, kcal: null, proteinG: null })

describe('保存', () => {
  it('初回に要件定義の初期値が入る', async () => {
    const d = fresh()
    const all = await readAll(d)
    expect(all.settings[0].baseWeight).toBe(72.5)
    expect(all.phases.map((p) => p.name).sort()).toEqual(['NF減量', '判定', '増量1', '減量1'].sort())
  })
  it('削除は行を残してフラグを立てる', async () => {
    const d = fresh()
    await put('dailyLogs', log('2026-12-01', 72.5), d)
    await remove('dailyLogs', '2026-12-01', d)
    const row = (await readAll(d)).dailyLogs[0]
    expect(row.deleted).toBe(true)
    expect(row.updatedAt).toBeGreaterThan(0)
  })
  it('書き出し → 全消去 → 読み込みで元に戻る', async () => {
    const d = fresh()
    await put('dailyLogs', log('2026-12-01', 72.5), d)
    await put('topSets', { id: 'a', date: '2026-12-01', lift: 'SQ', weight: 150, reps: 3, rpe: 8, comp: true, memo: '' }, d)
    await put('settings', { ...(await readAll(d)).settings[0], standard74: 545 }, d)
    await put('cycles', { ...(await readAll(d)).cycles[0], baseTotal: 470 }, d)
    const before = await readAll(d)
    const json = await exportJSON(d)

    await resetLocal(d)
    expect((await readAll(d)).dailyLogs).toEqual([])
    expect((await readAll(d)).settings[0].standard74).toBe(540)
    expect((await readAll(d)).cycles[0].baseTotal).toBeNull()

    await importJSON(json, d)
    const after = await readAll(d)
    expect(after.dailyLogs).toEqual(before.dailyLogs)
    expect(after.topSets).toEqual(before.topSets)
    expect(after.settings).toEqual(before.settings)
    expect(after.cycles).toEqual(before.cycles)
  })
  it('読み込みは手元の新しい記録を潰さない', async () => {
    const d = fresh()
    await put('dailyLogs', log('2026-12-01', 72.5), d)
    const json = await exportJSON(d)
    await new Promise((r) => setTimeout(r, 5))
    await put('dailyLogs', log('2026-12-01', 73.0), d)
    await importJSON(json, d)
    expect((await readAll(d)).dailyLogs[0].weight).toBe(73.0)
  })
  it('別のファイルは拒否する', () => {
    expect(() => parsePayload('{"foo":1}')).toThrow()
    expect(() => parsePayload('{"app":"cycle-tracker","schema":1,"data":{"dailyLogs":5}}')).toThrow()
  })
})
