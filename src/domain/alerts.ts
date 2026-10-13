import { checkpointTotals, weeklyE1rm, weeklyTotal } from './e1rm'
import { resolveFormula } from './formulas'
import { phaseAt } from './phases'
import type { DailyLog, ISODate, Phase, Settings, TopSet } from './types'
import { addDays, weekStart } from './weeks'
import { avgBodyFatInWindow, latestPace } from './weight'

export type AlertId = 'bodyFatOver' | 'bulkTooFast' | 'bulkTooSlow' | 'cutTooFast' | 'e1rmDropping'

export interface Alert {
  id: AlertId
  title: string
  detail: string
}

const f1 = (x: number) => x.toFixed(1)

/**
 * 減量期のトータルe1RMが2週続けて閾値以上低下しているか。
 * 比較の基準は減量期に入る直前のトータルe1RM（直近2週の平均）。
 */
export function e1rmDroppedTwoWeeks(
  s: Settings,
  cut: Phase,
  sets: TopSet[],
  asOf: ISODate,
): { ref: number; weeks: [number, number] } | null {
  if (cut.startDate === null) return null
  const fn = resolveFormula(s).fn
  const ref = checkpointTotals(sets, addDays(cut.startDate, -1), fn).total
  if (ref === null) return null

  const weekly = weeklyE1rm(
    sets.filter((x) => x.date <= asOf),
    fn,
  )
  const first = weekStart(cut.startDate)
  // 減量期のうち、記録のある最新の週とその前の週
  let w = weekStart(asOf)
  while (w >= first && !weekly.has(w)) w = addDays(w, -7)
  const prev = addDays(w, -7)
  if (prev < first) return null

  const a = weeklyTotal(weekly, prev).total
  const b = weeklyTotal(weekly, w).total
  if (a === null || b === null) return null
  const limit = ref * (1 - s.e1rmDropAlertPct / 100)
  return a <= limit && b <= limit ? { ref, weeks: [a, b] } : null
}

/** 5.8 アラート */
export function computeAlerts(
  s: Settings,
  phases: Phase[],
  logs: DailyLog[],
  sets: TopSet[],
  asOf: ISODate,
): Alert[] {
  const out: Alert[] = []

  const bf = avgBodyFatInWindow(logs, asOf)
  if (bf !== null && bf > s.bodyFatLimitPct) {
    out.push({
      id: 'bodyFatOver',
      title: '体脂肪率が上限超過',
      detail: `7日平均 ${f1(bf)}%（上限 ${s.bodyFatLimitPct}%）`,
    })
  }

  const phase = phaseAt(phases, asOf)
  const pace = latestPace(logs, asOf)

  if (phase?.kind === 'bulk' && pace) {
    if (pace.perMonth > s.bulkPaceMaxPerMonth) {
      out.push({
        id: 'bulkTooFast',
        title: '脂肪が増えすぎ',
        detail: `ペース +${f1(pace.perMonth)}kg/月（上限 ${f1(s.bulkPaceMaxPerMonth)}）`,
      })
    } else if (pace.perMonth < s.bulkPaceMinPerMonth) {
      out.push({
        id: 'bulkTooSlow',
        title: '筋肥大のペース不足',
        detail: `ペース ${pace.perMonth >= 0 ? '+' : ''}${f1(pace.perMonth)}kg/月（下限 ${f1(s.bulkPaceMinPerMonth)}）`,
      })
    }
  }

  if (phase?.kind === 'cut') {
    // 減量期は減少量を正の値として閾値と比べる
    if (pace && -pace.perMonth > s.cutPaceMaxPerMonth) {
      out.push({
        id: 'cutTooFast',
        title: '筋肉の損失リスク',
        detail: `ペース −${f1(-pace.perMonth)}kg/月（上限 ${f1(s.cutPaceMaxPerMonth)}）`,
      })
    }
    const d = e1rmDroppedTwoWeeks(s, phase, sets, asOf)
    if (d) {
      out.push({
        id: 'e1rmDropping',
        title: '減量ペースの見直し',
        detail: `トータルe1RMが2週続けて${s.e1rmDropAlertPct}%以上低下（減量前 ${f1(d.ref)} → ${f1(d.weeks[0])}, ${f1(d.weeks[1])}）`,
      })
    }
  }

  return out
}
