import { adjustedTotal } from './adjust'
import { checkpointTotals, type Totals } from './e1rm'
import type { Cycle } from './phases'
import type { DailyLog, ISODate, Settings, TopSet } from './types'
import { avgWeightInWindow } from './weight'

export type PaceVerdict = 'inRange' | 'borderline' | 'hard'
export type DropVerdict = 'normal' | 'grey' | 'large'
export type ClassVerdict = 'either' | 'lean83' | 'recommend83' | 'recommend74'

/** 5.4 必要ペース = (74kg級標準 − 基準トータル) × 係数 */
export function requiredGain(s: Settings, baseTotal: number): number {
  return (s.standard74 - baseTotal) * s.requiredPaceFactor
}

/** 5.4 判定① */
export function judgePace(gain: number, required: number, s: Settings): PaceVerdict {
  if (gain >= required) return 'inRange'
  if (gain >= required * s.borderlineFactor) return 'borderline'
  return 'hard'
}

/** 5.5 判定② */
export function judgeDrop(drop: number, s: Settings): DropVerdict {
  if (drop <= s.dropNormalMaxKg) return 'normal'
  if (drop <= s.dropGreyMaxKg) return 'grey'
  return 'large'
}

/** 5.6 階級判定のまとめ */
export function judgeClass(pace: PaceVerdict, drop: DropVerdict): ClassVerdict {
  if (pace === 'hard') return 'recommend74'
  if (drop === 'normal') return 'either'
  if (drop === 'grey') return 'lean83'
  return 'recommend83'
}

/** 5.7 必要な月ペース = (着地目標体重 − 2月末の週平均体重) / 月数 */
export function route83Pace(targetKg: number, weekAvgWeight: number, months: number): number {
  return (targetKg - weekAvgWeight) / months
}

export interface Judgement {
  /** 減量期の終了日以降なら確定、それより前は途中経過 */
  final: boolean
  /** 計算に使った日（確定なら減量期の終了日） */
  evalDate: ISODate
  bulkEndDate: ISODate
  cutEndDate: ISODate
  now: Totals
  weekAvgWeight: number | null
  adjTotal: number | null
  baseTotal: number | null
  gain: number | null
  required: number | null
  pace: PaceVerdict | null
  /** 5.4 10月時点の予測トータル = 基準トータル + 伸び × 倍率 */
  projection: number | null
  atBulkEnd: Totals | null
  drop: number | null
  dropVerdict: DropVerdict | null
  classVerdict: ClassVerdict | null
  route83: { targetKg: number; perMonth: number }[]
}

export function judge(
  s: Settings,
  cycle: Cycle,
  logs: DailyLog[],
  sets: TopSet[],
  asOf: ISODate,
): Judgement {
  const cutEnd = cycle.cut.endDate
  const bulkEnd = cycle.bulk.endDate
  const final = asOf >= cutEnd
  const evalDate = final ? cutEnd : asOf

  const now = checkpointTotals(sets, evalDate)
  const weekAvgWeight = avgWeightInWindow(logs, evalDate)
  const adjTotal =
    now.total !== null && weekAvgWeight !== null
      ? adjustedTotal(now.total, s.baseWeight, weekAvgWeight, s.allometricExponent)
      : null

  const gain = adjTotal !== null && s.baseTotal !== null ? adjTotal - s.baseTotal : null
  const required = s.baseTotal !== null ? requiredGain(s, s.baseTotal) : null
  const pace = gain !== null && required !== null ? judgePace(gain, required, s) : null
  const projection =
    gain !== null && s.baseTotal !== null ? s.baseTotal + gain * s.projectionMultiplier : null

  // 落ち幅は減量期に入ってからでないと意味がない。体重補正はかけない
  const inCut = evalDate > bulkEnd
  const atBulkEnd = inCut ? checkpointTotals(sets, bulkEnd) : null
  const drop =
    atBulkEnd && atBulkEnd.total !== null && now.total !== null ? atBulkEnd.total - now.total : null
  const dropVerdict = drop !== null ? judgeDrop(drop, s) : null

  const classVerdict = pace !== null && dropVerdict !== null ? judgeClass(pace, dropVerdict) : null

  const route83 =
    weekAvgWeight !== null
      ? s.route83TargetsKg.map((targetKg) => ({
          targetKg,
          perMonth: route83Pace(targetKg, weekAvgWeight, s.route83Months),
        }))
      : []

  return {
    final,
    evalDate,
    bulkEndDate: bulkEnd,
    cutEndDate: cutEnd,
    now,
    weekAvgWeight,
    adjTotal,
    baseTotal: s.baseTotal,
    gain,
    required,
    pace,
    projection,
    atBulkEnd,
    drop,
    dropVerdict,
    classVerdict,
    route83,
  }
}
