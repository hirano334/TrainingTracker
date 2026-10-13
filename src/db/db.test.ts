import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { exportJSON, importJSON, parsePayload } from './backup'
import { EXAMPLE_CYCLES } from '../domain/example'
import { getMeta, put, readAll, remove, resetLocal, SETUP_DONE, TrackerDB } from './db'

let n = 0
const fresh = () => new TrackerDB(`test-${n++}`)
const log = (date: string, weight: number) => ({ date, weight, bodyFatPct: null, kcal: null, proteinG: null })

describe('保存', () => {
  it('初回は白紙。特定の人の計画は入れず、セットアップ待ちになる', async () => {
    const d = fresh()
    const all = await readAll(d)
    expect(all.settings).toHaveLength(1)
    expect(all.settings[0].goalTotal).toBeNull()
    expect(all.settings[0].classChoice).toBe(false)
    expect(all.phases).toEqual([])
    expect(all.cycles).toEqual([])
    expect(await getMeta(SETUP_DONE, d)).toBeUndefined()
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
    await put('settings', { ...(await readAll(d)).settings[0], goalTotal: 545 }, d)
    await put('cycles', { ...EXAMPLE_CYCLES[0], baseTotal: 470 }, d)
    const before = await readAll(d)
    const json = await exportJSON(d)

    await resetLocal(d)
    expect((await readAll(d)).dailyLogs).toEqual([])
    expect((await readAll(d)).settings[0].goalTotal).toBeNull()
    expect((await readAll(d)).cycles).toEqual([])

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
