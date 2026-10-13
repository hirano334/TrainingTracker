import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { dailyLogsCSV, topSetsCSV } from '../db/backup'
import { applyImport, parseCSV, parseImport } from '../db/csvImport'
import { put, readAll, TrackerDB } from '../db/db'
import { DEFAULT_CYCLES, DEFAULT_PHASES, DEFAULT_SETTINGS } from './defaults'
import { estimateMaintenance } from './energy'
import { epley } from './formulas'
import { judge } from './judgement'
import { brokenRecords, records } from './records'
import { buildResults, weeklyTable } from './report'
import { sampleData } from './sample'
import { dailySeries } from './series'
import type { Cycle, DailyLog, Lift, Settings, TopSet } from './types'
import { addDays } from './weeks'

const S: Settings = { ...DEFAULT_SETTINGS }
const CYCLE: Cycle = { ...DEFAULT_CYCLES[0], baseTotal: 470 }
const log = (date: string, weight: number, kcal: number | null = null): DailyLog => ({
  date,
  weight,
  bodyFatPct: null,
  kcal,
  proteinG: null,
  updatedAt: 1,
})
let n = 0
const set = (date: string, lift: Lift, weight: number, reps: number, rpe: number, comp = true): TopSet => ({
  id: `t${n++}`,
  date,
  lift,
  weight,
  reps,
  rpe,
  comp,
  memo: '',
  updatedAt: 1,
})
const days = (_from: string, count: number, f: (i: number) => DailyLog | null) =>
  Array.from({ length: count }, (_, i) => f(i)).filter((x): x is DailyLog => x !== null)

describe('式の切り替え', () => {
  const d = sampleData()
  it('式を変えると判定値が変わる', () => {
    const a = judge(S, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    const b = judge({ ...S, e1rmFormulaId: 'brzycki' }, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(a.now.total).not.toBeNull()
    expect(b.now.total).not.toBeCloseTo(a.now.total as number, 0)
  })
  it('壊れた独自式なら Epley と同じ値になる', () => {
    const broken = { ...S, customFormulas: [{ id: 'c', name: 'x', expr: 'w +' }], e1rmFormulaId: 'c' }
    const a = judge(S, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    const b = judge(broken, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(b.now.total).toBe(a.now.total)
  })
})

describe('サイクルの申告', () => {
  it('2サイクル目を自分の基準で判定できる', () => {
    const d = sampleData()
    const c2: Cycle = {
      ...CYCLE,
      id: 'c2',
      name: '第2サイクル',
      baseDate: '2026-12-31',
      baseWeight: 74,
      baseTotal: 480,
      bulkEndDate: '2027-01-31',
      cutEndDate: '2027-02-28',
      requiredPaceFactor: 0.5,
      projectionMultiplier: 1.5,
    }
    const j = judge(S, c2, d.dailyLogs, d.topSets, '2027-03-10')
    expect(j.required).toBeCloseTo((540 - 480) * 0.5)
    expect(j.projection).toBeCloseTo(480 + (j.gain as number) * 1.5)
    expect(j.adjTotal).toBeCloseTo((j.now.total as number) * Math.pow(74 / (j.weekAvgWeight as number), 2 / 3))
  })
  it('旧版のデータベースから、設定の基準値が第1サイクルに引き継がれる', async () => {
    const name = 'migrate-test'
    const v1 = new Dexie(name)
    v1.version(1).stores({
      settings: 'id',
      phases: 'id',
      dailyLogs: 'date',
      waistLogs: 'date',
      topSets: 'id, date',
      checkpoints: 'date',
      meta: 'key',
    })
    await v1.table('settings').add({
      ...DEFAULT_SETTINGS,
      updatedAt: 123,
      baseWeight: 72.8,
      baseTotal: 468,
      requiredPaceFactor: 0.45,
      projectionMultiplier: 2.5,
    })
    await v1.table('phases').bulkAdd(DEFAULT_PHASES)
    v1.close()

    const d = new TrackerDB(name)
    const { cycles } = await readAll(d)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toMatchObject({
      id: 'cycle-1',
      updatedAt: 123,
      baseDate: '2026-11-30',
      baseWeight: 72.8,
      baseTotal: 468,
      bulkEndDate: '2027-01-31',
      cutEndDate: '2027-02-28',
      requiredPaceFactor: 0.45,
    })
  })
})

describe('維持カロリーの推定', () => {
  it('体重が一定なら平均摂取カロリーと一致', () => {
    const logs = days('2026-12-01', 14, (i) => log(addDays('2026-12-01', i), 73, 2600 + (i % 2) * 100))
    const e = estimateMaintenance(logs, '2026-12-14', 14, 7700)
    expect(e.ok).toBe(true)
    expect(e.maintenance).toBeCloseTo(2650)
  })
  it('週0.35kg増なら平均摂取より385kcal低い', () => {
    const logs = days('2026-12-01', 14, (i) => log(addDays('2026-12-01', i), 73 + 0.05 * i, 3000))
    const e = estimateMaintenance(logs, '2026-12-14', 14, 7700)
    expect(e.slopePerDay).toBeCloseTo(0.05)
    expect(e.maintenance).toBeCloseTo(3000 - 385)
  })
  it('カロリーの記録が7割に満たなければ推定しない', () => {
    const logs = days('2026-12-01', 14, (i) => log(addDays('2026-12-01', i), 73, i < 9 ? 2600 : null))
    const e = estimateMaintenance(logs, '2026-12-14', 14, 7700)
    expect(e.ok).toBe(false)
    expect(e.reason).toMatch(/10日分必要（現在9日分）/)
    expect(e.maintenance).toBeNull()
  })
})

describe('体重トレンド', () => {
  it('7日移動平均。記録が4日未満の日は出さない', () => {
    const logs = [0, 1, 2, 3, 4, 5, 6].map((i) => log(addDays('2026-12-01', i), 73 + i * 0.1))
    const rows = dailySeries(DEFAULT_PHASES, logs, '2026-12-01', '2026-12-08')
    expect(rows[2].trend).toBeNull()
    expect(rows[3].trend).toBeCloseTo(73.15)
    expect(rows[6].trend).toBeCloseTo(73.3)
    expect(rows[7].weight).toBeNull()
    expect(rows[7].trend).toBeCloseTo(73.35) // 12/2〜12/7 の6日分
    expect(rows[0].target).not.toBeNull()
  })
})

describe('自己ベスト', () => {
  const sets = [
    set('2026-12-01', 'SQ', 150, 3, 8),
    set('2026-12-08', 'SQ', 160, 1, 9),
    set('2026-12-10', 'SQ', 200, 1, 10, false),
    set('2026-12-02', 'BP', 100, 2, 9),
  ]
  it('種目ごとの e1RM ベストと回数別の最高重量。試合基準×は数えない', () => {
    const r = records(sets, epley)
    expect(r.SQ.bestE1rm?.value).toBeCloseTo(175)
    expect(r.SQ.bestE1rm?.set.date).toBe('2026-12-01')
    expect(r.SQ.byReps[1]?.weight).toBe(160)
    expect(r.SQ.byReps[2]).toBeNull()
    expect(r.DL.bestE1rm).toBeNull()
  })
  it('更新の判定', () => {
    const next = (weight: number, reps: number, rpe: number, comp = true) => ({
      id: 'new',
      date: '2026-12-20',
      lift: 'SQ' as const,
      weight,
      reps,
      rpe,
      comp,
      memo: '',
    })
    expect(brokenRecords(sets, next(155, 3, 8), epley)).toEqual(['e1rm', 'weight'])
    expect(brokenRecords(sets, next(152.5, 3, 6), epley)).toEqual(['e1rm', 'weight'])
    expect(brokenRecords(sets, next(162.5, 1, 10), epley)).toEqual(['weight']) // e1RM は 167.9 で届かない
    expect(brokenRecords(sets, next(140, 3, 8), epley)).toEqual([])
    expect(brokenRecords(sets, next(300, 1, 10, false), epley)).toEqual([])
    expect(brokenRecords(sets, next(120, 4, 8), epley)).toEqual([]) // 4回は初めて、e1RM も届かない
    expect(brokenRecords([], next(100, 3, 8), epley)).toEqual([]) // 最初の記録
  })
  it('修正中のセット自身とは比べない', () => {
    const edited = { ...sets[0], weight: 152.5 }
    expect(brokenRecords(sets, edited, epley)).toEqual(['e1rm'])
  })
})

describe('結果の書き出し', () => {
  const d = sampleData()
  const input = { settings: S, phases: DEFAULT_PHASES, cycles: [CYCLE], ...d }
  it('使った式・週次の値・判定がそろう', () => {
    const r = buildResults(input, '2027-02-28', new Date('2027-02-28T01:00:00Z'))
    expect(r.formula).toMatchObject({ id: 'epley', expr: 'w * (1 + r / 30)', fallbackReason: null })
    expect(r.weekly).toHaveLength(15)
    expect(r.judgements).toHaveLength(1)
    expect(r.judgements[0].classVerdict).not.toBeNull()
    expect(r.records.SQ.bestE1rm).not.toBeNull()
    expect(r.maintenance.days).toBe(14)
    expect(() => JSON.stringify(r)).not.toThrow()
  })
  it('週次の表', () => {
    const r = buildResults(input, '2027-02-28')
    const t = weeklyTable(r.weekly)
    expect(t.header).toHaveLength(10)
    expect(t.rows).toHaveLength(15)
    expect(t.rows[0][0]).toBe('2026-11-16')
    expect(t.rows[0][1]).toBe('2026-11-22')
    expect(t.rows.every((row) => row.length === 10)).toBe(true)
  })
})

describe('CSV の取り込み', () => {
  let k = 0
  const fresh = () => new TrackerDB(`csv-test-${k++}`)

  it('引用符・改行・BOM', () => {
    expect(parseCSV('﻿a,b\r\n"x,1","y ""q""\nz"\n\n1,2').map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['x,1', 'y "q"\nz'],
      ['1', '2'],
    ])
  })
  it('アプリ自身の書き出しを読み込むと元に戻る', async () => {
    const src = sampleData()
    const d = fresh()
    const logs = parseImport(dailyLogsCSV(src.dailyLogs))
    const sets = parseImport(topSetsCSV(src.topSets))
    expect(logs.kind).toBe('dailyLogs')
    expect(sets.kind).toBe('topSets')
    expect(logs.errors).toEqual([])
    expect(sets.errors).toEqual([])
    await applyImport(logs, false, d)
    await applyImport(sets, false, d)
    const all = await readAll(d)
    const strip = <T extends { updatedAt: number }>(rows: T[]) => rows.map(({ updatedAt: _, ...r }) => r)
    expect(strip(all.dailyLogs)).toEqual(strip(src.dailyLogs))
    const key = (s: { date: string; lift: string }) => s.date + s.lift
    const body = (rows: TopSet[]) =>
      rows.map(({ id: _i, updatedAt: _u, ...r }) => r).sort((a, b) => key(a).localeCompare(key(b)))
    expect(body(all.topSets)).toEqual(body(src.topSets))
  })
  it('2回読み込んでも増えない', async () => {
    const d = fresh()
    const text = 'date,lift,weight,reps,rpe\n2026-10-01,squat,150,3,8\n2026/10/3,ベンチプレス,100,2,8.5\n'
    expect(await applyImport(parseImport(text), false, d)).toEqual({ added: 2, skipped: 0 })
    expect(await applyImport(parseImport(text), false, d)).toEqual({ added: 0, skipped: 2 })
    const sets = (await readAll(d)).topSets
    expect(sets).toHaveLength(2)
    expect(sets.find((s) => s.lift === 'BP')).toMatchObject({ date: '2026-10-03', comp: true, rpe: 8.5 })
  })
  it('既に記録のある日は上書きしない（指定すれば上書き）', async () => {
    const d = fresh()
    await put('dailyLogs', { date: '2026-10-01', weight: 74, bodyFatPct: null, kcal: null, proteinG: null }, d)
    const text = '日付,体重(kg)\n2026-10-01,73.0\n2026-10-02,73.2\n'
    expect(await applyImport(parseImport(text), false, d)).toEqual({ added: 1, skipped: 1 })
    expect((await d.dailyLogs.get('2026-10-01'))?.weight).toBe(74)
    expect(await applyImport(parseImport(text), true, d)).toEqual({ added: 2, skipped: 0 })
    expect((await d.dailyLogs.get('2026-10-01'))?.weight).toBe(73)
  })
  it('読めない行は行番号つきで報告し、残りは取り込む', () => {
    const p = parseImport(
      ['date,lift,weight,reps,rpe,comp', '2026-10-01,SQ,150,3,8,○', '2026-13-01,SQ,150,3,8,', '2026-10-02,PRESS,60,3,8,', '2026-10-03,DL,180,8,8,', '2026-10-04,DL,180,3,8.3,', '2026-10-05,DL,abc,3,8,', '2026-10-06,BP,100,1,9,×'].join('\n'),
    )
    expect(p.rows).toHaveLength(2)
    expect(p.rows[1]).toMatchObject({ lift: 'BP', comp: false })
    expect(p.errors).toEqual([
      { line: 3, reason: '日付が読めません' },
      { line: 4, reason: '種目は SQ / BP / DL のいずれか' },
      { line: 5, reason: '回数は1〜5' },
      { line: 6, reason: 'RPE は6〜10の0.5刻み' },
      { line: 7, reason: '重量が読めません' },
    ])
  })
  it('見出しが分からないファイルは拒否する', () => {
    expect(() => parseImport('foo,bar\n1,2')).toThrow(/見出し/)
    expect(() => parseImport('date,lift,weight\n2026-10-01,SQ,100')).toThrow(/回数/)
    expect(() => parseImport('')).toThrow(/空/)
  })
})
