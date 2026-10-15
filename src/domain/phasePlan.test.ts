import { describe, expect, it } from 'vitest'
import { computeAlerts } from './alerts'
import { EXAMPLE_PHASES, EXAMPLE_SETTINGS } from './example'
import {
  kcalCorrection,
  kcalPerDayFor,
  PACE_PRESETS,
  paceLabel,
  phaseKcal,
  phasePace,
  planPhase,
  type PlanInput,
} from './phasePlan'
import { targetWeightOn } from './phases'
import type { DailyLog, Phase } from './types'
import { addDays } from './weeks'

const S = EXAMPLE_SETTINGS
const base: Omit<PlanInput, 'how'> = { kind: 'bulk', startDate: '2027-03-01', startWeight: 74 }
const log = (date: string, weight: number): DailyLog => ({
  date,
  weight,
  bodyFatPct: null,
  kcal: null,
  proteinG: null,
  updatedAt: 1,
})
const asPhase = (p: NonNullable<ReturnType<typeof planPhase>>, kind: 'bulk' | 'cut' = 'bulk'): Phase => ({
  id: 'x',
  updatedAt: 1,
  name: 'x',
  kind,
  startDate: p.startDate,
  endDate: p.endDate,
  startWeight: p.startWeight,
  targetWeightMin: p.targetWeight,
  targetWeightMax: p.targetWeight,
  targetPacePerMonth: p.pacePerMonth,
  paceNote: '',
  kcalOffsetMin: null,
  kcalOffsetMax: null,
})

describe('よくある増減幅', () => {
  it('体重に対する割合で持ち、kg に直す', () => {
    const p = planPhase({ ...base, how: { mode: 'preset', level: 'standard', weeks: 8 } })
    expect(p).toMatchObject({ startDate: '2027-03-01', endDate: '2027-04-25', days: 56, targetWeight: 77 }) // 74 × 0.5% × 8 = 2.96
    expect(p?.pctPerWeek).toBeCloseTo(((77 - 74) / 74) * 100 / 8, 3)
  })
  it('減量は負の向き', () => {
    const p = planPhase({ ...base, kind: 'cut', how: { mode: 'preset', level: 'fast', weeks: 4 } })
    expect(p?.targetWeight).toBe(71) // 74 × 1% × 4 = 2.96
    expect(p?.pacePerMonth).toBeLessThan(0)
  })
  it('並びは ゆっくり → 標準 → 速め、増量は正・減量は負', () => {
    expect(PACE_PRESETS.bulk.map((p) => p.pctPerWeek)).toEqual([0.25, 0.5, 0.75])
    expect(PACE_PRESETS.cut.map((p) => p.pctPerWeek)).toEqual([-0.5, -0.75, -1.0])
  })
})

describe('決め方の3通り', () => {
  it('n週で x kg', () => {
    const p = planPhase({ ...base, how: { mode: 'amount', weeks: 8, kg: 2 } })
    expect(p).toMatchObject({ endDate: '2027-04-25', targetWeight: 76 })
    expect(p?.pacePerMonth).toBeCloseTo(2 / (56 / 30.4375))
    const c = planPhase({ ...base, kind: 'cut', how: { mode: 'amount', weeks: 4, kg: 1.5 } })
    expect(c?.targetWeight).toBe(72.5) // 減量は向きが逆
  })
  it('終了日と目標体重からペースを出す', () => {
    const p = planPhase({ ...base, how: { mode: 'target', endDate: '2027-04-25', targetWeight: 76 } })
    expect(p?.days).toBe(56)
    expect(p?.pacePerMonth).toBeCloseTo(2 / (56 / 30.4375))
  })
  it('同じ計画になる入力どうしは同じ結果', () => {
    const a = planPhase({ ...base, how: { mode: 'amount', weeks: 8, kg: 2 } })
    const b = planPhase({ ...base, how: { mode: 'target', endDate: a!.endDate, targetWeight: a!.targetWeight } })
    expect(b).toEqual(a)
  })
  it('目標ラインは開始日の前日に開始体重、終了日に目標体重', () => {
    const ph = asPhase(planPhase({ ...base, how: { mode: 'amount', weeks: 8, kg: 2 } })!)
    expect(targetWeightOn(ph, '2027-02-28')).toBeCloseTo(74)
    expect(targetWeightOn(ph, '2027-04-25')).toBeCloseTo(76)
  })
  it('おかしな入力は null', () => {
    expect(planPhase({ ...base, how: { mode: 'preset', level: 'standard', weeks: 0 } })).toBeNull()
    expect(planPhase({ ...base, how: { mode: 'preset', level: 'standard', weeks: 2.5 } })).toBeNull()
    expect(planPhase({ ...base, how: { mode: 'amount', weeks: 4, kg: 0 } })).toBeNull()
    expect(planPhase({ ...base, how: { mode: 'target', endDate: '2027-02-27', targetWeight: 75 } })).toBeNull()
    expect(planPhase({ ...base, startWeight: 0, how: { mode: 'amount', weeks: 4, kg: 1 } })).toBeNull()
  })
})

describe('カロリー', () => {
  it('ペース × 7700 ÷ 30.44、10kcal 単位', () => {
    expect(kcalPerDayFor(1.5, 7700)).toBe(380)
    expect(kcalPerDayFor(-1.5, 7700)).toBe(-380)
    expect(kcalPerDayFor(0, 7700)).toBe(0)
  })
  it('手入力があればそちらを使い、無ければ計画ペースから', () => {
    const bulk1 = EXAMPLE_PHASES.find((p) => p.id === 'bulk-1')!
    expect(phaseKcal(bulk1, S)).toEqual({ min: 400, max: 500, auto: false }) // 要件定義のフェーズは手入力
    const auto = { ...bulk1, kcalOffsetMin: null, kcalOffsetMax: null }
    expect(phaseKcal(auto, S)).toMatchObject({ auto: true, min: kcalPerDayFor(phasePace(auto)!, 7700) })
  })
  it('計画ペースは保存値を優先し、無ければ開始日・開始体重・目標体重から計算する', () => {
    const bulk1 = EXAMPLE_PHASES.find((p) => p.id === 'bulk-1')!
    expect(phasePace(bulk1)).toBe(1.5) // 本人が決めたペース
    expect(phasePace({ ...bulk1, targetPacePerMonth: null })).toBeCloseTo(3 / (62 / 30.4375)) // 72.5 → 75.5 を62日
    const nf = EXAMPLE_PHASES.find((p) => p.id === 'nf-cut')!
    expect(phasePace({ ...nf, targetPacePerMonth: null })).toBeNull() // 開始日が無い
  })
  it('ペースの表示', () => {
    expect(paceLabel(1.47)).toBe('+1.5kg/月')
    expect(paceLabel(-1.5)).toBe('−1.5kg/月')
    expect(paceLabel(-0.01)).toBe('+0.0kg/月')
  })
})

describe('ずれの補正', () => {
  // 計画 +1.5kg/月相当の増量（3/1〜4/25、74 → 76.76）
  const plan = planPhase({ ...base, how: { mode: 'target', endDate: '2027-04-25', targetWeight: 76.76 } })!
  const ph = asPhase(plan)
  const twoWeeks = (w1: number, w2: number) => [
    ...[0, 1, 2].map((i) => log(addDays('2027-03-15', i), w1)),
    ...[0, 1, 2].map((i) => log(addDays('2027-03-22', i), w2)),
  ]

  it('実際のペースが遅ければ、増やす量を出す', () => {
    const c = kcalCorrection(ph, twoWeeks(74.6, 74.8), '2027-03-24', S) // +0.86kg/月
    expect(c?.status).toBe('ok')
    if (c?.status !== 'ok') return
    expect(c.actual).toBeCloseTo(0.2 * (30 / 7))
    expect(c.kcal).toBe(kcalPerDayFor(c.planned - c.actual, 7700))
    expect(c.kcal).toBeGreaterThan(100)
  })
  it('速ければ減らす量、ほぼ計画どおりなら 0', () => {
    const fast = kcalCorrection(ph, twoWeeks(74.6, 75.2), '2027-03-24', S)
    expect(fast?.status === 'ok' && fast.kcal).toBeLessThan(0)
    const ok = kcalCorrection(ph, twoWeeks(74.6, 74.95), '2027-03-24', S) // +1.5kg/月
    expect(ok).toMatchObject({ status: 'ok', kcal: 0 })
  })
  it('始まって2週は出さない（増量は水分とグリコーゲンの戻りを説明する）', () => {
    const c = kcalCorrection(ph, twoWeeks(74.6, 74.8), '2027-03-10', S)
    expect(c).toMatchObject({ status: 'wait' })
    expect(c?.status === 'wait' && c.reason).toMatch(/グリコーゲン/)
  })
  it('記録が足りなければ null', () => {
    expect(kcalCorrection(ph, [], '2027-03-24', S)).toBeNull()
  })
})

describe('ペースの警告は計画ペース基準', () => {
  const ids = (phases: Phase[], logs: DailyLog[], asOf: string) =>
    computeAlerts(S, phases, logs, [], asOf).map((a) => a.id)
  const twoWeeks = (w1: number, w2: number) => [
    ...[0, 1, 2].map((i) => log(addDays('2027-03-15', i), w1)),
    ...[0, 1, 2].map((i) => log(addDays('2027-03-22', i), w2)),
  ]
  it('「速め」を選んだ人には、速めのペースで警告しない', () => {
    // 74kg × 0.75%/週 ≒ +2.4kg/月 の計画
    const fast = asPhase(planPhase({ ...base, how: { mode: 'preset', level: 'fast', weeks: 8 } })!)
    expect(ids([fast], twoWeeks(74.6, 75.15), '2027-03-24')).toEqual([]) // +2.36kg/月
    // 同じペースでも、標準の計画なら速すぎ
    const std = asPhase(planPhase({ ...base, how: { mode: 'preset', level: 'standard', weeks: 8 } })!)
    expect(ids([std], twoWeeks(74.6, 75.15), '2027-03-24')).toEqual(['bulkTooFast'])
    expect(ids([std], twoWeeks(74.6, 74.7), '2027-03-24')).toEqual(['bulkTooSlow'])
  })
  it('減量も計画 ±0.5kg/月', () => {
    const cut = asPhase(planPhase({ ...base, kind: 'cut', how: { mode: 'preset', level: 'slow', weeks: 4 } })!, 'cut')
    // 計画 −1.6kg/月前後。−2.6kg/月なら速すぎ、−1.7kg/月なら問題なし
    expect(ids([cut], twoWeeks(73.6, 73.0), '2027-03-24')).toEqual(['cutTooFast'])
    expect(ids([cut], twoWeeks(73.6, 73.2), '2027-03-24')).toEqual([])
  })
})
