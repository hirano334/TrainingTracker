import type { DailyLog, ISODate } from './types'
import { addDays, diffDays } from './weeks'

/** 期間のうち、これ以上の割合の日に記録があれば推定する */
export const MIN_COVERAGE = 0.7

export interface MaintenanceEstimate {
  /** 推定できたか。できないときは reason に理由 */
  ok: boolean
  reason: string | null
  days: number
  kcalDays: number
  weightDays: number
  avgKcal: number | null
  /** 体重の傾き (kg/日)。期間中の日々の体重の回帰直線 */
  slopePerDay: number | null
  maintenance: number | null
}

/**
 * 維持カロリー = 期間中の平均摂取カロリー − 体重の傾き(kg/日) × kcalPerKg
 * endDate を最終日とする days 日間で推定する。
 */
export function estimateMaintenance(
  logs: DailyLog[],
  endDate: ISODate,
  days: number,
  kcalPerKg: number,
): MaintenanceEstimate {
  const from = addDays(endDate, -(days - 1))
  const xs = logs.filter((l) => !l.deleted && l.date >= from && l.date <= endDate)
  const kcals = xs.filter((l) => l.kcal !== null).map((l) => l.kcal as number)
  const need = Math.ceil(days * MIN_COVERAGE)
  const base = { days, kcalDays: kcals.length, weightDays: xs.length }
  const fail = (reason: string): MaintenanceEstimate => ({
    ...base,
    ok: false,
    reason,
    avgKcal: null,
    slopePerDay: null,
    maintenance: null,
  })
  if (kcals.length < need) return fail(`カロリーの記録が${need}日分必要（現在${kcals.length}日分）`)
  if (xs.length < need) return fail(`体重の記録が${need}日分必要（現在${xs.length}日分）`)

  const avgKcal = kcals.reduce((a, b) => a + b, 0) / kcals.length
  const pts = xs.map((l) => [diffDays(from, l.date), l.weight] as const)
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)
  if (sxx === 0) return fail('体重の記録が同じ日に偏っています')
  const slopePerDay = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx
  return {
    ...base,
    ok: true,
    reason: null,
    avgKcal,
    slopePerDay,
    maintenance: avgKcal - slopePerDay * kcalPerKg,
  }
}
