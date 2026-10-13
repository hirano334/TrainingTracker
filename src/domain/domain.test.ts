import { describe, expect, it } from 'vitest'
import { adjustedTotal } from './adjust'
import { computeAlerts } from './alerts'
import { EXAMPLE_CYCLES, EXAMPLE_PHASES, EXAMPLE_SETTINGS } from './example'
import { checkpointTotals, weeklyE1rm, weeklyTotal } from './e1rm'
import { epley as e1rm } from './formulas'
import { judge, judgeClass, judgeDrop, judgePace, requiredGain, upperRoutePace } from './judgement'
import { findPhasePairs, phaseAt, targetWeightOn } from './phases'
import { sampleData } from './sample'
import { weeklySeries } from './series'
import { resolveCycle, type ResolvedCycle } from './cycles'
import type { DailyLog, Lift, Phase, Settings, TopSet } from './types'
import { addDays, diffDays, weekStart } from './weeks'
import { avgWeightInWindow, latestPace, pacePerMonth, weeklyWeights } from './weight'

const S: Settings = { ...EXAMPLE_SETTINGS }
const CYCLE = resolveCycle({ ...EXAMPLE_CYCLES[0], baseTotal: 470 }, EXAMPLE_PHASES) as ResolvedCycle
const phase = (id: string) => EXAMPLE_PHASES.find((p) => p.id === id) as Phase

const log = (date: string, weight: number, bodyFatPct: number | null = null): DailyLog => ({
  date,
  weight,
  bodyFatPct,
  kcal: null,
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

/** その週に3種目とも RPE10 の1回で、e1RM の合計が total になるセットを作る */
const weekOfTotal = (monday: string, total: number): TopSet[] => {
  const w = total / 3 / (1 + 1 / 30)
  return [set(monday, 'SQ', w, 1, 10), set(addDays(monday, 2), 'BP', w, 1, 10), set(addDays(monday, 4), 'DL', w, 1, 10)]
}

describe('週と日付', () => {
  it('週は月曜始まり', () => {
    expect(weekStart('2026-11-30')).toBe('2026-11-30') // 月
    expect(weekStart('2027-02-28')).toBe('2027-02-22') // 日
    expect(weekStart('2027-01-01')).toBe('2026-12-28') // 金、年をまたぐ
  })
  it('日数の計算', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDays('2026-12-01', '2027-01-31')).toBe(61)
  })
})

describe('5.1 体重', () => {
  it('週平均体重はその週の平均', () => {
    const w = weeklyWeights([log('2026-12-07', 73.0), log('2026-12-09', 73.4), log('2026-12-14', 74.0)])
    expect(w.get('2026-12-07')?.avg).toBeCloseTo(73.2)
    expect(w.get('2026-12-14')?.avg).toBeCloseTo(74.0)
  })
  it('月ペース = 直近2週の差 × 30/7', () => {
    expect(pacePerMonth(73.0, 73.35)).toBeCloseTo(1.5)
  })
  it('今週の記録が3日未満なら前の週でペースを見る', () => {
    const logs = [
      ...['2026-12-07', '2026-12-08', '2026-12-09'].map((d) => log(d, 73.0)),
      ...['2026-12-14', '2026-12-15', '2026-12-16'].map((d) => log(d, 73.35)),
      log('2026-12-21', 75.0),
    ]
    const p = latestPace(logs, '2026-12-21')
    expect(p?.weekStart).toBe('2026-12-14')
    expect(p?.perMonth).toBeCloseTo(1.5)
  })
  it('削除済みは数えない', () => {
    expect(avgWeightInWindow([log('2026-12-07', 73), { ...log('2026-12-08', 99), deleted: true }], '2026-12-08')).toBe(73)
  })
})

describe('フェーズ', () => {
  it('日付からフェーズを引く', () => {
    expect(phaseAt(EXAMPLE_PHASES, '2026-11-01')?.id).toBe('nf-cut')
    expect(phaseAt(EXAMPLE_PHASES, '2026-12-01')?.id).toBe('bulk-1')
    expect(phaseAt(EXAMPLE_PHASES, '2027-02-28')?.id).toBe('cut-1')
    expect(phaseAt(EXAMPLE_PHASES, '2027-03-01')).toBeNull()
  })
  it('目標体重ラインは開始体重から目標体重まで直線', () => {
    const b = phase('bulk-1')
    expect(targetWeightOn(b, '2026-11-30')).toBeCloseTo(72.5)
    expect(targetWeightOn(b, '2027-01-31')).toBeCloseTo(75.5)
    expect(targetWeightOn(b, '2026-12-31')).toBeCloseTo(72.5 + 3 * (31 / 62))
  })
  it('目標が範囲のときは中央値', () => {
    expect(targetWeightOn(phase('cut-1'), '2027-02-28')).toBeCloseTo(73.85)
  })
  it('行を足すと次のサイクルも拾う', () => {
    const more: Phase[] = [
      ...EXAMPLE_PHASES,
      { ...phase('bulk-1'), id: 'bulk-2', startDate: '2027-03-01', endDate: '2027-04-30' },
      { ...phase('cut-1'), id: 'cut-2', startDate: '2027-05-01', endDate: '2027-05-31' },
    ]
    expect(findPhasePairs(more).map((c) => [c.bulk.id, c.cut.id])).toEqual([
      ['bulk-1', 'cut-1'],
      ['bulk-2', 'cut-2'],
    ])
    expect(phaseAt(more, '2027-05-10')?.id).toBe('cut-2')
  })
})

describe('5.2 e1RM', () => {
  it('100kg × 3回 × RPE8 → RIR 2 → 116.7', () => {
    expect(e1rm(100, 3, 8)).toBeCloseTo(100 * (1 + 5 / 30))
    expect(e1rm(100, 3, 8)).toBeCloseTo(116.67, 2)
  })
  it('RPEは0.5刻み', () => {
    expect(e1rm(150, 2, 8.5)).toBeCloseTo(150 * (1 + 3.5 / 30))
  })
  it('週のe1RMは種目ごとの最大。試合基準×は除外', () => {
    const w = weeklyE1rm(
      [
        set('2026-12-07', 'SQ', 150, 3, 8),
        set('2026-12-10', 'SQ', 160, 1, 9),
        set('2026-12-11', 'SQ', 200, 1, 10, false),
      ],
      e1rm,
    )
    expect(w.get('2026-12-07')?.SQ).toBeCloseTo(175) // 150 × (1 + 5/30)
  })
  it('トータルは3種目の合計。欠けた種目は2週前まで引き継ぐ', () => {
    const w = weeklyE1rm(
      [
        set('2026-12-07', 'SQ', 150, 1, 10),
        set('2026-12-07', 'BP', 90, 1, 10),
        set('2026-12-07', 'DL', 180, 1, 10),
        set('2026-12-14', 'SQ', 153, 1, 10),
      ],
      e1rm,
    )
    const k = 1 + 1 / 30
    expect(weeklyTotal(w, '2026-12-07').total).toBeCloseTo(420 * k)
    expect(weeklyTotal(w, '2026-12-14').total).toBeCloseTo(423 * k)
    expect(weeklyTotal(w, '2026-12-21').total).toBeCloseTo(423 * k)
    expect(weeklyTotal(w, '2026-12-28').total).toBeNull() // BP, DL が3週前
  })
  it('チェックポイントの値は直近2週の週のe1RMの平均', () => {
    const sets = [...weekOfTotal('2027-02-15', 480), ...weekOfTotal('2027-02-22', 486)]
    expect(checkpointTotals(sets, '2027-02-28', e1rm).total).toBeCloseTo(483)
  })
  it('片方の週しか記録がなければその値', () => {
    expect(checkpointTotals(weekOfTotal('2027-02-22', 486), '2027-02-28', e1rm).total).toBeCloseTo(486)
  })
})

describe('5.3 体重補正', () => {
  it('補正トータル = トータル × (基準体重 / 週平均体重)^(2/3)', () => {
    expect(adjustedTotal(500, 72.5, 74.0, 2 / 3)).toBeCloseTo(500 * Math.pow(72.5 / 74, 2 / 3))
  })
  it('体重1kgの差はトータルの約0.9%', () => {
    const r = adjustedTotal(100, 72.5, 73.5, 2 / 3)
    expect(100 - r).toBeGreaterThan(0.85)
    expect(100 - r).toBeLessThan(0.95)
  })
})

describe('5.4 判定① 伸びのペース', () => {
  it('必要ペース = (74kg級標準 − 基準トータル) × 0.4', () => {
    expect(requiredGain(540, 470, CYCLE.requiredPaceFactor)).toBeCloseTo(28)
  })
  it('境界値', () => {
    expect(judgePace(28, 28, S)).toBe('inRange')
    expect(judgePace(27.9, 28, S)).toBe('borderline')
    expect(judgePace(14, 28, S)).toBe('borderline')
    expect(judgePace(13.9, 28, S)).toBe('hard')
  })
})

describe('5.5 判定② 落ち幅', () => {
  it('境界値', () => {
    // 増量終了時のトータルに対する割合。既定は 2% / 3%
    expect(judgeDrop(2, S)).toBe('normal')
    expect(judgeDrop(2.01, S)).toBe('grey')
    expect(judgeDrop(3, S)).toBe('grey')
    expect(judgeDrop(3.01, S)).toBe('large')
    expect(judgeDrop(-1, S)).toBe('normal')
  })
})

describe('5.6 階級判定', () => {
  it('表のとおり', () => {
    expect(judgeClass('inRange', 'normal')).toBe('either')
    expect(judgeClass('borderline', 'normal')).toBe('either')
    expect(judgeClass('inRange', 'large')).toBe('recommendUpper')
    expect(judgeClass('borderline', 'grey')).toBe('leanUpper')
    expect(judgeClass('hard', 'normal')).toBe('recommendLower')
    expect(judgeClass('hard', 'large')).toBe('recommendLower')
  })
})

describe('5.7 83kg級ルート', () => {
  it('必要な月ペース = (着地目標 − 2月末の週平均体重) / 7', () => {
    expect(upperRoutePace(81, 74, 7)).toBeCloseTo(1.0)
    expect(upperRoutePace(82, 74, 7)).toBeCloseTo(8 / 7)
  })
})

describe('判定の通し計算', () => {
  const cycle = CYCLE
  // 1月末のトータル 510、2月末のトータル 498、2月末の週平均体重 74.0
  const sets = [
    ...weekOfTotal('2027-01-18', 510),
    ...weekOfTotal('2027-01-25', 510),
    ...weekOfTotal('2027-02-15', 498),
    ...weekOfTotal('2027-02-22', 498),
  ]
  const logs = ['2027-02-22', '2027-02-25', '2027-02-28'].map((d) => log(d, 74.0))

  it('2月末以降は確定値', () => {
    const j = judge(S, cycle, logs, sets, '2027-03-05')
    const adj = 498 * Math.pow(72.5 / 74, 2 / 3)
    expect(j.final).toBe(true)
    expect(j.evalDate).toBe('2027-02-28')
    expect(j.now.total).toBeCloseTo(498)
    expect(j.adjTotal).toBeCloseTo(adj)
    expect(j.gain).toBeCloseTo(adj - 470) // ≒ 21.2
    expect(j.required).toBeCloseTo(28)
    expect(j.pace).toBe('borderline')
    expect(j.projection).toBeCloseTo(470 + (adj - 470) * 2.5)
    expect(j.drop).toBeCloseTo(12) // 補正なし
    expect(j.dropPct).toBeCloseTo((12 / 510) * 100) // 2.35%
    expect(j.dropVerdict).toBe('grey')
    expect(j.classVerdict).toBe('leanUpper')
    expect(j.upperRoute).toEqual([
      { targetKg: 81, perMonth: expect.closeTo(1.0) },
      { targetKg: 82, perMonth: expect.closeTo(8 / 7) },
    ])
  })
  it('増量期の途中は暫定で、落ち幅は出さない', () => {
    const j = judge(S, cycle, [log('2027-01-28', 75)], sets, '2027-01-31')
    expect(j.final).toBe(false)
    expect(j.gain).not.toBeNull()
    expect(j.drop).toBeNull()
    expect(j.classVerdict).toBeNull()
  })
  it('基準トータルが未入力なら判定しない', () => {
    const j = judge(S, { ...CYCLE, baseTotal: null }, logs, sets, '2027-03-05')
    expect(j.pace).toBeNull()
    expect(j.drop).toBeCloseTo(12)
  })
})

describe('5.8 アラート', () => {
  const ids = (logs: DailyLog[], sets: TopSet[], asOf: string) =>
    computeAlerts(S, EXAMPLE_PHASES, logs, sets, asOf).map((a) => a.id)
  const twoWeeks = (m1: string, w1: number, m2: string, w2: number) => [
    ...[0, 1, 2].map((i) => log(addDays(m1, i), w1)),
    ...[0, 1, 2].map((i) => log(addDays(m2, i), w2)),
  ]

  it('体脂肪率は7日平均で見る', () => {
    const over = [log('2026-12-10', 73, 16), log('2026-12-11', 73, 19)]
    expect(ids(over, [], '2026-12-11')).toContain('bodyFatOver') // 平均 17.5
    const ok = [log('2026-12-10', 73, 15), log('2026-12-11', 73, 18.9)]
    expect(ids(ok, [], '2026-12-11')).not.toContain('bodyFatOver') // 平均 16.95
  })
  it('増量期：速すぎ・遅すぎ', () => {
    expect(ids(twoWeeks('2026-12-07', 73, '2026-12-14', 73.5), [], '2026-12-16')).toEqual(['bulkTooFast']) // +2.1
    expect(ids(twoWeeks('2026-12-07', 73, '2026-12-14', 73.2), [], '2026-12-16')).toEqual(['bulkTooSlow']) // +0.9
    expect(ids(twoWeeks('2026-12-07', 73, '2026-12-14', 73.35), [], '2026-12-16')).toEqual([]) // +1.5
  })
  it('減量期：速すぎ', () => {
    expect(ids(twoWeeks('2027-02-01', 75.5, '2027-02-08', 75.0), [], '2027-02-10')).toEqual(['cutTooFast']) // −2.1
    expect(ids(twoWeeks('2027-02-01', 75.5, '2027-02-08', 75.2), [], '2027-02-10')).toEqual([]) // −1.3
  })
  it('減量期：トータルe1RMが2週続けて5%以上低下', () => {
    const before = [...weekOfTotal('2027-01-18', 500), ...weekOfTotal('2027-01-25', 500)]
    const twoBad = [...before, ...weekOfTotal('2027-02-01', 474), ...weekOfTotal('2027-02-08', 470)]
    expect(ids([], twoBad, '2027-02-14')).toEqual(['e1rmDropping'])
    const oneBad = [...before, ...weekOfTotal('2027-02-01', 490), ...weekOfTotal('2027-02-08', 470)]
    expect(ids([], oneBad, '2027-02-14')).toEqual([])
  })
})

describe('サンプルデータ', () => {
  const d = sampleData()
  it('3ヶ月半ぶんの週次系列が出る', () => {
    const rows = weeklySeries(S, 72.5, EXAMPLE_PHASES, d.dailyLogs, d.topSets, d.waistLogs, '2026-11-16', '2027-02-28')
    expect(rows).toHaveLength(15)
    expect(rows.every((r) => r.avgWeight !== null && r.waist !== null)).toBe(true)
    expect(rows.at(-1)?.total).not.toBeNull()
    expect(rows.at(-1)?.adjTotal).toBeLessThan(rows.at(-1)?.total as number)
  })
  it('判定まで計算できる', () => {
    const j = judge(S, CYCLE, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.final).toBe(true)
    expect(j.classVerdict).not.toBeNull()
  })
})
