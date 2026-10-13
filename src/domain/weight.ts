import { targetWeightAt } from './phases'
import type { DailyLog, ISODate, Phase } from './types'
import { addDays, weekStart } from './weeks'

export interface WeekWeight {
  weekStart: ISODate
  avg: number
  count: number
  dates: ISODate[]
}

function live<T extends { deleted?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted)
}

/** 5.1 週平均体重：その週の毎日の体重の平均 */
export function weeklyWeights(logs: DailyLog[]): Map<ISODate, WeekWeight> {
  const sums = new Map<ISODate, { sum: number; dates: ISODate[] }>()
  for (const l of live(logs)) {
    const w = weekStart(l.date)
    const s = sums.get(w) ?? { sum: 0, dates: [] }
    s.sum += l.weight
    s.dates.push(l.date)
    sums.set(w, s)
  }
  const out = new Map<ISODate, WeekWeight>()
  for (const [w, s] of sums) {
    out.set(w, { weekStart: w, avg: s.sum / s.dates.length, count: s.dates.length, dates: s.dates })
  }
  return out
}

/** endDate を最終日とする days 日間の平均体重。チェックポイント時点の「週平均体重」に使う */
export function avgWeightInWindow(logs: DailyLog[], endDate: ISODate, days = 7): number | null {
  const from = addDays(endDate, -(days - 1))
  const xs = live(logs).filter((l) => l.date >= from && l.date <= endDate)
  if (xs.length === 0) return null
  return xs.reduce((a, l) => a + l.weight, 0) / xs.length
}

/** 5.1 月あたりのペース：直近2週の週平均体重の差 × (30 / 7) */
export function pacePerMonth(prevWeekAvg: number, weekAvg: number): number {
  return (weekAvg - prevWeekAvg) * (30 / 7)
}

/** 週の途中で平均が1〜2日分しかないとペースが暴れるので、この日数に満たない週は前の週で見る */
export const MIN_DAYS_FOR_PACE = 3

export interface Pace {
  weekStart: ISODate
  weekAvg: number
  prevWeekAvg: number
  perMonth: number
}

export function latestPace(logs: DailyLog[], asOf: ISODate): Pace | null {
  const weeks = weeklyWeights(logs.filter((l) => l.date <= asOf))
  let w = weekStart(asOf)
  if ((weeks.get(w)?.count ?? 0) < MIN_DAYS_FOR_PACE) w = addDays(w, -7)
  const cur = weeks.get(w)
  const prev = weeks.get(addDays(w, -7))
  if (!cur || !prev) return null
  return {
    weekStart: w,
    weekAvg: cur.avg,
    prevWeekAvg: prev.avg,
    perMonth: pacePerMonth(prev.avg, cur.avg),
  }
}

/** その週に体重を記録した日について、目標体重ラインの値を平均したもの */
export function weekTarget(week: WeekWeight, phases: Phase[]): number | null {
  const ts = week.dates
    .map((d) => targetWeightAt(phases, d))
    .filter((t): t is number => t !== null)
  if (ts.length === 0) return null
  return ts.reduce((a, b) => a + b, 0) / ts.length
}

/** 体脂肪率の、endDate までの days 日平均（5.8） */
export function avgBodyFatInWindow(logs: DailyLog[], endDate: ISODate, days = 7): number | null {
  const from = addDays(endDate, -(days - 1))
  const xs = live(logs)
    .filter((l) => l.date >= from && l.date <= endDate && l.bodyFatPct !== null)
    .map((l) => l.bodyFatPct as number)
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
