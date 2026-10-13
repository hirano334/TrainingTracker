import { adjustedTotal } from './adjust'
import { checkpointTotals, type Totals } from './e1rm'
import { resolveFormula } from './formulas'
import { monthsBetween } from './planning'
import type { Cycle, DailyLog, ISODate, Settings, TopSet } from './types'
import { avgWeightInWindow } from './weight'

export type PaceVerdict = 'inRange' | 'borderline' | 'hard'
export type DropVerdict = 'normal' | 'grey' | 'large'
export type ClassVerdict = 'either' | 'leanUpper' | 'recommendUpper' | 'recommendLower'

/** 5.4 必要ペース = (目標トータル − 基準トータル) × 係数 */
export function requiredGain(goalTotal: number, baseTotal: number, factor: number): number {
  return (goalTotal - baseTotal) * factor
}

/** 5.4 判定① */
export function judgePace(gain: number, required: number, s: Settings): PaceVerdict {
  if (gain >= required) return 'inRange'
  if (gain >= required * s.borderlineFactor) return 'borderline'
  return 'hard'
}

/** 5.5 判定②。落ち幅は増量終了時のトータルに対する割合(%)で見る */
export function judgeDrop(dropPct: number, s: Settings): DropVerdict {
  if (dropPct <= s.dropNormalMaxPct) return 'normal'
  if (dropPct <= s.dropGreyMaxPct) return 'grey'
  return 'large'
}

/** 5.6 階級判定のまとめ */
export function judgeClass(pace: PaceVerdict, drop: DropVerdict): ClassVerdict {
  // 目標に届くのが厳しいなら、上の階級に上げるぶんの増量コストをかけない
  if (pace === 'hard') return 'recommendLower'
  if (drop === 'normal') return 'either'
  if (drop === 'grey') return 'leanUpper'
  return 'recommendUpper'
}

/** 5.7 必要な月ペース = (着地目標体重 − 減量終了時の週平均体重) / 月数 */
export function upperRoutePace(targetKg: number, weekAvgWeight: number, months: number): number {
  return (targetKg - weekAvgWeight) / months
}

export interface Judgement {
  cycle: Cycle
  /** 減量終了日以降なら確定、それより前は途中経過 */
  final: boolean
  /** 計算に使った日（確定なら減量終了日） */
  evalDate: ISODate
  now: Totals
  weekAvgWeight: number | null
  adjTotal: number | null
  gain: number | null
  required: number | null
  pace: PaceVerdict | null
  /** 5.4 本命大会時点の予測トータル = 基準トータル + 伸び × 倍率 */
  projection: number | null
  atBulkEnd: Totals | null
  drop: number | null
  /** 落ち幅の、増量終了時のトータルに対する割合(%) */
  dropPct: number | null
  dropVerdict: DropVerdict | null
  /** 階級の判定。設定で使わないことにしていれば null */
  classVerdict: ClassVerdict | null
  /** 上の階級に上げるのに使える月数。大会日も手入力も無ければ null */
  upperRouteMonths: number | null
  upperRoute: { targetKg: number; perMonth: number }[]
}

/** 申告されたサイクル1件を判定する */
export function judge(s: Settings, cycle: Cycle, logs: DailyLog[], sets: TopSet[], asOf: ISODate): Judgement {
  const fn = resolveFormula(s).fn
  const final = asOf >= cycle.cutEndDate
  const evalDate = final ? cycle.cutEndDate : asOf

  const now = checkpointTotals(sets, evalDate, fn)
  const weekAvgWeight = avgWeightInWindow(logs, evalDate)
  const adjTotal =
    now.total !== null && weekAvgWeight !== null
      ? adjustedTotal(now.total, cycle.baseWeight, weekAvgWeight, s.allometricExponent)
      : null

  const base = cycle.baseTotal
  const gain = adjTotal !== null && base !== null ? adjTotal - base : null
  const required =
    base !== null && s.goalTotal !== null ? requiredGain(s.goalTotal, base, cycle.requiredPaceFactor) : null
  const pace = gain !== null && required !== null ? judgePace(gain, required, s) : null
  const projection = gain !== null && base !== null ? base + gain * cycle.projectionMultiplier : null

  // 落ち幅は減量期に入ってからでないと意味がない。体重補正はかけない
  const inCut = evalDate > cycle.bulkEndDate
  const atBulkEnd = inCut ? checkpointTotals(sets, cycle.bulkEndDate, fn) : null
  const drop =
    atBulkEnd && atBulkEnd.total !== null && now.total !== null ? atBulkEnd.total - now.total : null
  const dropPct =
    drop !== null && atBulkEnd && atBulkEnd.total !== null && atBulkEnd.total > 0
      ? (drop / atBulkEnd.total) * 100
      : null
  const dropVerdict = dropPct !== null ? judgeDrop(dropPct, s) : null

  const classVerdict =
    s.classChoice && pace !== null && dropVerdict !== null ? judgeClass(pace, dropVerdict) : null

  const months =
    s.upperRouteMonths ?? (s.mainMeetDate !== null ? monthsBetween(evalDate, s.mainMeetDate) : null)
  const upperRouteMonths = s.classChoice && months !== null && months > 0 ? months : null
  const upperRoute =
    weekAvgWeight !== null && upperRouteMonths !== null
      ? s.upperLandingTargetsKg.map((targetKg) => ({
          targetKg,
          perMonth: upperRoutePace(targetKg, weekAvgWeight, upperRouteMonths),
        }))
      : []

  return {
    cycle,
    final,
    evalDate,
    now,
    weekAvgWeight,
    adjTotal,
    gain,
    required,
    pace,
    projection,
    atBulkEnd,
    drop,
    dropPct,
    dropVerdict,
    classVerdict,
    upperRouteMonths,
    upperRoute,
  }
}

/** 基準日の古い順 */
export function sortCycles(cycles: Cycle[]): Cycle[] {
  return cycles.filter((c) => !c.deleted).sort((a, b) => a.baseDate.localeCompare(b.baseDate))
}

/** グラフの体重補正に使う基準体重：最初のサイクルの基準体重 */
export function referenceWeight(s: Settings, cycles: Cycle[]): number {
  return sortCycles(cycles)[0]?.baseWeight ?? s.baseWeight
}
