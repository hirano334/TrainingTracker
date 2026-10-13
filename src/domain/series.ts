import { adjustedTotal } from './adjust'
import { weeklyE1rm, weeklyTotal } from './e1rm'
import { resolveFormula } from './formulas'
import { targetWeightAt } from './phases'
import type { DailyLog, ISODate, Phase, Settings, TopSet, WaistLog } from './types'
import { addDays, weekStart, weekStartsBetween } from './weeks'
import { weeklyWeights } from './weight'

export interface WeekRow {
  weekStart: ISODate
  avgWeight: number | null
  /** 週の中日（木曜）時点の目標体重ライン */
  targetWeight: number | null
  SQ: number | null
  BP: number | null
  DL: number | null
  /** 試合基準×のセットだけで見た週の最大（参考表示用） */
  SQx: number | null
  BPx: number | null
  DLx: number | null
  total: number | null
  adjTotal: number | null
  waist: number | null
}

/** グラフ・サマリー用の週次系列 */
export function weeklySeries(
  s: Settings,
  /** 体重補正の基準体重 */
  refWeight: number,
  phases: Phase[],
  logs: DailyLog[],
  sets: TopSet[],
  waists: WaistLog[],
  from: ISODate,
  to: ISODate,
): WeekRow[] {
  const weights = weeklyWeights(logs)
  const fn = resolveFormula(s).fn
  const e1 = weeklyE1rm(sets, fn)

  const nonComp = new Map<ISODate, Record<string, number>>()
  for (const x of sets) {
    if (x.deleted || x.comp) continue
    const w = weekStart(x.date)
    const row = nonComp.get(w) ?? {}
    row[x.lift] = Math.max(row[x.lift] ?? 0, fn(x.weight, x.reps, x.rpe))
    nonComp.set(w, row)
  }

  const waistByWeek = new Map<ISODate, number[]>()
  for (const x of waists) {
    if (x.deleted) continue
    const w = weekStart(x.date)
    waistByWeek.set(w, [...(waistByWeek.get(w) ?? []), x.waistCm])
  }

  return weekStartsBetween(from, to).map((w) => {
    const avgWeight = weights.get(w)?.avg ?? null
    const t = weeklyTotal(e1, w)
    const own = e1.get(w)
    const ws = waistByWeek.get(w)
    return {
      weekStart: w,
      avgWeight,
      targetWeight: targetWeightAt(phases, addDays(w, 3)),
      SQ: own?.SQ ?? null,
      BP: own?.BP ?? null,
      DL: own?.DL ?? null,
      SQx: nonComp.get(w)?.SQ ?? null,
      BPx: nonComp.get(w)?.BP ?? null,
      DLx: nonComp.get(w)?.DL ?? null,
      total: t.total,
      adjTotal:
        t.total !== null && avgWeight !== null
          ? adjustedTotal(t.total, refWeight, avgWeight, s.allometricExponent)
          : null,
      waist: ws ? ws.reduce((a, b) => a + b, 0) / ws.length : null,
    }
  })
}

export interface DayRow {
  date: ISODate
  weight: number | null
  /** その日までの7日移動平均。記録が少ない日は出さない */
  trend: number | null
  target: number | null
}

/** 移動平均を出すのに必要な、7日間のうちの記録日数 */
export const MIN_DAYS_FOR_TREND = 4

/** 日々の体重と7日移動平均 */
export function dailySeries(phases: Phase[], logs: DailyLog[], from: ISODate, to: ISODate): DayRow[] {
  const byDate = new Map<ISODate, number>()
  for (const l of logs) if (!l.deleted) byDate.set(l.date, l.weight)
  const out: DayRow[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const window: number[] = []
    for (let i = 0; i < 7; i++) {
      const w = byDate.get(addDays(d, -i))
      if (w !== undefined) window.push(w)
    }
    out.push({
      date: d,
      weight: byDate.get(d) ?? null,
      trend: window.length >= MIN_DAYS_FOR_TREND ? window.reduce((a, b) => a + b, 0) / window.length : null,
      target: targetWeightAt(phases, d),
    })
  }
  return out
}
