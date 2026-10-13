import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './defaults'
import { EXAMPLE_CYCLES, EXAMPLE_SETTINGS } from './example'
import { judge } from './judgement'
import { phaseAt, targetWeightOn } from './phases'
import { gainWeight, monthsBetween, suggestFactors } from './planning'
import { sampleData } from './sample'
import { buildSetup, type SetupAnswers } from './setup'
import type { Cycle, Phase } from './types'

const CYCLE: Cycle = { ...EXAMPLE_CYCLES[0], baseTotal: 470 }
const d = sampleData()

describe('階級の一般化', () => {
  it('階級の判定を使わない設定では、判定①と落ち幅だけを出す', () => {
    const s = { ...EXAMPLE_SETTINGS, classChoice: false }
    const j = judge(s, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.pace).not.toBeNull()
    expect(j.dropVerdict).not.toBeNull()
    expect(j.classVerdict).toBeNull()
    expect(j.upperRoute).toEqual([])
  })
  it('目標トータルが未入力なら判定①は出さない', () => {
    const j = judge({ ...EXAMPLE_SETTINGS, goalTotal: null }, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.required).toBeNull()
    expect(j.pace).toBeNull()
    expect(j.gain).not.toBeNull()
  })
  it('別の階級の組でも同じ計算（66kg級 → 74kg級）', () => {
    const s = {
      ...EXAMPLE_SETTINGS,
      goalTotal: 500,
      lowerClassName: '66kg級',
      upperClassName: '74kg級',
      upperLandingTargetsKg: [73],
      upperRouteMonths: 5,
    }
    const j = judge(s, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.required).toBeCloseTo((500 - 470) * 0.4)
    expect(j.upperRoute).toEqual([{ targetKg: 73, perMonth: expect.closeTo((73 - (j.weekAvgWeight as number)) / 5) }])
  })
  it('月数を入れていなければ、判定日から本命大会までの月数を使う', () => {
    const s = { ...EXAMPLE_SETTINGS, upperRouteMonths: null, mainMeetDate: '2027-09-28' }
    const j = judge(s, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.upperRouteMonths).toBeCloseTo(monthsBetween('2027-02-28', '2027-09-28')) // ≒ 6.97
    expect(j.upperRouteMonths).toBeGreaterThan(6.9)
    expect(j.upperRouteMonths).toBeLessThan(7.1)
    const none = judge({ ...s, mainMeetDate: null }, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(none.upperRouteMonths).toBeNull()
    expect(none.upperRoute).toEqual([])
  })
  it('落ち幅はトータルに対する割合で見るので、トータルが小さい人でも同じ基準になる', () => {
    const s = { ...EXAMPLE_SETTINGS }
    const light = d.topSets.map((x) => ({ ...x, weight: x.weight * 0.5 }))
    const a = judge(s, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    const b = judge(s, CYCLE, d.dailyLogs, light, '2027-02-28')
    expect(b.drop).toBeCloseTo((a.drop as number) * 0.5)
    expect(b.dropPct).toBeCloseTo(a.dropPct as number)
    expect(b.dropVerdict).toBe(a.dropVerdict)
  })
})

describe('設定の読み替え', () => {
  it('新しい項目が欠けていれば初期値で補う', () => {
    const s = normalizeSettings({ id: 'settings', updatedAt: 5, goalTotal: 400, show: { waist: false } as never })
    expect(s.goalTotal).toBe(400)
    expect(s.dropNormalMaxPct).toBe(2)
    expect(s.show).toEqual({ waist: false, nutrition: true, bodyFat: true, checkpoint: true })
  })
  it('今の形の設定には手を加えない', () => {
    expect(normalizeSettings(EXAMPLE_SETTINGS)).toEqual(EXAMPLE_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('係数を日付から出す', () => {
  it('伸びの比は 1 : 0.8 : 0.7、その先は1割ずつ鈍る', () => {
    expect([1, 2, 3].map(gainWeight)).toEqual([1, 0.8, 0.7])
    expect(gainWeight(4)).toBeCloseTo(0.63)
    expect(gainWeight(5)).toBeCloseTo(0.567)
  })
  it('大会までちょうど3サイクルなら、要件定義の 0.4 と 2.5', () => {
    // 90日のサイクル × 3
    const f = suggestFactors({ baseDate: '2026-11-30', cutEndDate: '2027-02-28' }, '2027-08-27')
    expect(f?.cycles).toBeCloseTo(3)
    expect(f?.projectionMultiplier).toBe(2.5)
    expect(f?.requiredPaceFactor).toBe(0.4)
  })
  it('端数のサイクルは按分する', () => {
    const f = suggestFactors({ baseDate: '2026-11-30', cutEndDate: '2027-02-28' }, '2027-10-01')
    expect(f?.cycles).toBeCloseTo(305 / 90)
    expect(f?.projectionMultiplier).toBeCloseTo(2.5 + (305 / 90 - 3) * 0.63, 2)
    expect(f?.requiredPaceFactor).toBeCloseTo(1 / (f?.projectionMultiplier as number), 2)
  })
  it('大会がこのサイクルの終わりより前なら、このサイクルだけで届く必要がある', () => {
    const f = suggestFactors({ baseDate: '2026-11-30', cutEndDate: '2027-02-28' }, '2027-01-15')
    expect(f).toMatchObject({ cycles: 1, requiredPaceFactor: 1, projectionMultiplier: 1 })
  })
  it('大会日が無ければ出さない', () => {
    expect(suggestFactors({ baseDate: '2026-11-30', cutEndDate: '2027-02-28' }, null)).toBeNull()
  })
})

describe('初回セットアップ', () => {
  const answers: SetupAnswers = {
    weight: 65,
    goalTotal: 420,
    baseTotal: 380,
    mainMeetDate: '2027-06-27',
    classChoice: false,
    lowerClassName: '',
    upperClassName: '',
    upperClassStandard: null,
    upperLandingTargetsKg: [],
    baseDate: '2026-12-27',
    bulkWeeks: 8,
    cutWeeks: 4,
    bulkPerMonth: 1.5,
    cutPerMonth: 1.5,
    show: { waist: false, nutrition: true, bodyFat: false, checkpoint: true },
  }
  const plan = buildSetup(answers)
  const phases = plan.phases.map((p) => ({ ...p, updatedAt: 1 })) as Phase[]

  it('基準日の翌日から、増量 → 減量のフェーズを切れ目なく作る', () => {
    expect(plan.phases.map((p) => [p.kind, p.startDate, p.endDate])).toEqual([
      ['bulk', '2026-12-28', '2027-02-21'],
      ['cut', '2027-02-22', '2027-03-21'],
    ])
    expect(phaseAt(phases, '2027-02-21')?.id).toBe('bulk-1')
    expect(phaseAt(phases, '2027-02-22')?.id).toBe('cut-1')
  })
  it('目標体重はペースと期間から出す', () => {
    const [bulk, cut] = phases
    expect(bulk.startWeight).toBe(65)
    expect(bulk.targetWeightMin).toBeCloseTo(65 + (1.5 * 56) / 30.4375, 1) // 67.8
    expect(cut.startWeight).toBe(bulk.targetWeightMin)
    expect(cut.targetWeightMin).toBeCloseTo((bulk.targetWeightMin as number) - (1.5 * 28) / 30.4375, 1)
    expect(targetWeightOn(bulk, '2026-12-27')).toBeCloseTo(65)
    expect(bulk.targetPacePerMonth).toBe(1.5)
    expect(cut.targetPacePerMonth).toBe(-1.5)
    expect(bulk.kcalOffsetMin).toBeGreaterThan(0)
    expect(cut.kcalOffsetMin).toBeLessThan(0)
  })
  it('サイクルはフェーズと同じ日付で、係数は大会日から', () => {
    expect(plan.cycle).toMatchObject({
      baseDate: '2026-12-27',
      bulkEndDate: '2027-02-21',
      cutEndDate: '2027-03-21',
      baseWeight: 65,
      baseTotal: 380,
    })
    // 基準日から大会まで 182日 ÷ 84日 ≒ 2.17 サイクル → 1 + 0.8 + 0.17 × 0.7
    expect(plan.cycle.projectionMultiplier).toBeCloseTo(1.92, 2)
    expect(plan.cycle.requiredPaceFactor).toBeCloseTo(0.52, 2)
  })
  it('階級を迷っていなければ階級の項目は触らない', () => {
    expect(plan.settings).toMatchObject({ goalTotal: 420, baseWeight: 65, classChoice: false })
    expect(plan.settings).not.toHaveProperty('upperClassName')
    expect(plan.settings.show).toEqual(answers.show)
  })
  it('階級を迷っていれば階級の項目も入れる', () => {
    const p = buildSetup({
      ...answers,
      classChoice: true,
      lowerClassName: '66kg級',
      upperClassName: '74kg級',
      upperClassStandard: 480,
      upperLandingTargetsKg: [72, 73],
    })
    expect(p.settings).toMatchObject({ classChoice: true, upperClassName: '74kg級', upperLandingTargetsKg: [72, 73] })
  })
  it('大会日が無ければ係数は既定値', () => {
    const p = buildSetup({ ...answers, mainMeetDate: null })
    expect(p.cycle).toMatchObject({ requiredPaceFactor: 0.4, projectionMultiplier: 2.5 })
  })
})
