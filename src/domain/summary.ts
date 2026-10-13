import { adjustedTotal } from './adjust'
import type { ResolvedCycle } from './cycles'
import { checkpointTotals, type Totals } from './e1rm'
import { estimateMaintenance, type MaintenanceEstimate } from './energy'
import { resolveFormula } from './formulas'
import { monthsBetween } from './planning'
import {
  LIFTS,
  type Checkpoint,
  type DailyLog,
  type ISODate,
  type Lift,
  type Phase,
  type Settings,
  type TopSet,
  type WaistLog,
} from './types'
import { addDays, diffDays } from './weeks'
import { avgWeightInWindow } from './weight'

/** フェーズ1つぶんの実績。記録が無くて出せない値は null */
export interface PhaseSummary {
  phase: Phase
  /** まだ始まっていない */
  pending: boolean
  /** 終了日まで来ている */
  done: boolean
  /** 集計した最後の日（終了日か、途中なら今日） */
  to: ISODate
  days: number
  weightStart: number | null
  weightEnd: number | null
  weightChange: number | null
  /** 実際のペース (kg/月) */
  pacePerMonth: number | null
  totalStart: number | null
  totalEnd: number | null
  totalChange: number | null
  /** トータルの変化の、開始時に対する割合(%) */
  totalChangePct: number | null
  /** 体重補正後のトータルの変化 */
  adjChange: number | null
  liftChange: Record<Lift, number | null>
  waistChange: number | null
  avgKcal: number | null
  avgProtein: number | null
  avgSleepHr: number | null
  /** 体重を記録した日の割合 (0〜1) */
  logRate: number
}

/** 実測MAXと、その直前の推定1RMの比。推定の式が自分に合っているかの目安 */
export interface MaxRatio {
  date: ISODate
  measured: number
  estimated: number
  /** 実測 ÷ 推定。1 より大きければ、式より実際のほうが挙がる */
  ratio: number
}

export interface CycleSummary {
  /** 集計した最後の日 */
  to: ISODate
  started: boolean
  phases: PhaseSummary[]
  weightChange: number | null
  adjChange: number | null
  logRate: number
  avgSleepHr: number | null
  maintenance: MaintenanceEstimate
  maxRatio: Record<Lift, MaxRatio | null>
}

export interface SummaryInput {
  dailyLogs: DailyLog[]
  topSets: TopSet[]
  waistLogs: WaistLog[]
  checkpoints: Checkpoint[]
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const diff = (a: number | null, b: number | null): number | null => (a !== null && b !== null ? b - a : null)

const inRange = <T extends { date: ISODate; deleted?: boolean }>(rows: T[], from: ISODate, to: ISODate) =>
  rows.filter((r) => !r.deleted && r.date >= from && r.date <= to)

/** date を最終日とする7日間のウエストの平均 */
function waistAt(waists: WaistLog[], date: ISODate): number | null {
  return mean(inRange(waists, addDays(date, -6), date).map((w) => w.waistCm))
}

function adjusted(t: Totals, weight: number | null, s: Settings, base: number): number | null {
  return t.total !== null && weight !== null ? adjustedTotal(t.total, base, weight, s.allometricExponent) : null
}

/** サイクルの実績をフェーズごとにまとめる。asOf より先のことは数えない */
export function summarizeCycle(s: Settings, cycle: ResolvedCycle, d: SummaryInput, asOf: ISODate): CycleSummary {
  const fn = resolveFormula(s).fn
  const to = asOf < cycle.endDate ? asOf : cycle.endDate
  const started = asOf > cycle.baseDate

  // 基準日の体重は、サイクルに入れた基準体重を使う（判定①の「伸び」と同じ数え方にするため）
  const weightAt = (date: ISODate) =>
    date === cycle.baseDate ? cycle.baseWeight : avgWeightInWindow(d.dailyLogs, date)

  const phases = cycle.phases.map((phase): PhaseSummary => {
    const start = phase.startDate as ISODate
    const before = addDays(start, -1)
    const pending = asOf < start
    const end = asOf < phase.endDate ? asOf : phase.endDate
    const days = pending ? 0 : diffDays(before, end)
    const logs = pending ? [] : inRange(d.dailyLogs, start, end)

    const weightStart = pending ? null : weightAt(before)
    const weightEnd = pending ? null : avgWeightInWindow(d.dailyLogs, end)
    const weightChange = diff(weightStart, weightEnd)
    const t0 = checkpointTotals(d.topSets, before, fn)
    const t1 = checkpointTotals(d.topSets, end, fn)
    const totalChange = pending ? null : diff(t0.total, t1.total)

    return {
      phase,
      pending,
      done: asOf >= phase.endDate,
      to: end,
      days,
      weightStart,
      weightEnd,
      weightChange,
      // 1週間に満たないうちは、ペースとして読める数字にならない
      pacePerMonth: weightChange !== null && days >= 7 ? weightChange / monthsBetween(before, end) : null,
      totalStart: pending ? null : t0.total,
      totalEnd: pending ? null : t1.total,
      totalChange,
      totalChangePct: totalChange !== null && t0.total ? (totalChange / t0.total) * 100 : null,
      adjChange: pending
        ? null
        : diff(adjusted(t0, weightStart, s, cycle.baseWeight), adjusted(t1, weightEnd, s, cycle.baseWeight)),
      liftChange: Object.fromEntries(LIFTS.map((l) => [l, pending ? null : diff(t0[l], t1[l])])) as Record<
        Lift,
        number | null
      >,
      waistChange: pending ? null : diff(waistAt(d.waistLogs, before), waistAt(d.waistLogs, end)),
      avgKcal: mean(logs.filter((l) => l.kcal !== null).map((l) => l.kcal as number)),
      avgProtein: mean(logs.filter((l) => l.proteinG !== null).map((l) => l.proteinG as number)),
      avgSleepHr: mean(logs.filter((l) => l.sleepHr != null).map((l) => l.sleepHr as number)),
      logRate: days > 0 ? logs.length / days : 0,
    }
  })

  const first = addDays(cycle.baseDate, 1)
  const all = started ? inRange(d.dailyLogs, first, to) : []
  const span = started ? diffDays(cycle.baseDate, to) : 0
  const w0 = cycle.baseWeight
  const w1 = started ? avgWeightInWindow(d.dailyLogs, to) : null

  // 実測MAXを測った日について、その日より前の2週間の記録から出した推定1RMと比べる
  const maxRatio = Object.fromEntries(LIFTS.map((l) => [l, null])) as Record<Lift, MaxRatio | null>
  for (const c of inRange(d.checkpoints, addDays(cycle.baseDate, -7), to)) {
    const est = checkpointTotals(
      d.topSets.filter((x) => x.date < c.date),
      addDays(c.date, -1),
      fn,
    )
    const measured: Record<Lift, number | null> = { SQ: c.maxSQ, BP: c.maxBP, DL: c.maxDL }
    for (const l of LIFTS) {
      const m = measured[l]
      const e = est[l]
      if (m !== null && e !== null && e > 0) maxRatio[l] = { date: c.date, measured: m, estimated: e, ratio: m / e }
    }
  }

  return {
    to,
    started,
    phases,
    weightChange: diff(w0, w1),
    adjChange: started
      ? diff(
          adjusted(checkpointTotals(d.topSets, cycle.baseDate, fn), w0, s, cycle.baseWeight),
          adjusted(checkpointTotals(d.topSets, to, fn), w1, s, cycle.baseWeight),
        )
      : null,
    logRate: span > 0 ? all.length / span : 0,
    avgSleepHr: mean(all.filter((l) => l.sleepHr != null).map((l) => l.sleepHr as number)),
    maintenance: estimateMaintenance(d.dailyLogs, to, Math.max(span, 1), s.kcalPerKg),
    maxRatio,
  }
}
