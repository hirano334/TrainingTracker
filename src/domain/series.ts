import { adjustedTotal } from './adjust'
import { setE1rm, weeklyE1rm, weeklyTotal } from './e1rm'
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
  phases: Phase[],
  logs: DailyLog[],
  sets: TopSet[],
  waists: WaistLog[],
  from: ISODate,
  to: ISODate,
): WeekRow[] {
  const weights = weeklyWeights(logs)
  const e1 = weeklyE1rm(sets)

  const nonComp = new Map<ISODate, Record<string, number>>()
  for (const x of sets) {
    if (x.deleted || x.comp) continue
    const w = weekStart(x.date)
    const row = nonComp.get(w) ?? {}
    row[x.lift] = Math.max(row[x.lift] ?? 0, setE1rm(x))
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
          ? adjustedTotal(t.total, s.baseWeight, avgWeight, s.allometricExponent)
          : null,
      waist: ws ? ws.reduce((a, b) => a + b, 0) / ws.length : null,
    }
  })
}
