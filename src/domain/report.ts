import { computeAlerts, type Alert } from './alerts'
import { estimateMaintenance, type MaintenanceEstimate } from './energy'
import { resolveFormula } from './formulas'
import type { ResolvedCycle } from './cycles'
import { judge, referenceWeight, type Judgement } from './judgement'
import { records } from './records'
import { weeklySeries, type WeekRow } from './series'
import type { DailyLog, ISODate, Lift, Phase, Settings, TopSet, WaistLog } from './types'
import { LIFTS } from './types'
import { addDays } from './weeks'

export interface ResultsInput {
  settings: Settings
  phases: Phase[]
  /** 基準日の古い順 */
  cycles: ResolvedCycle[]
  dailyLogs: DailyLog[]
  waistLogs: WaistLog[]
  topSets: TopSet[]
}

interface RecordOut {
  bestE1rm: { value: number; date: ISODate; weight: number; reps: number; rpe: number } | null
  byReps: Record<number, { date: ISODate; weight: number; rpe: number } | null>
}

/** 計算結果の書き出し。記録（入力値）のバックアップとは別物で、読み込みには使わない */
export interface Results {
  app: 'cycle-tracker'
  kind: 'results'
  generatedAt: string
  asOf: ISODate
  /** 計算に使った推定1RMの式。式を変えると値がすべて変わるので必ず残す */
  formula: { id: string; name: string; expr: string; fallbackReason: string | null }
  referenceWeight: number
  settings: Settings
  phases: Phase[]
  judgements: Judgement[]
  weekly: WeekRow[]
  alerts: Alert[]
  records: Record<Lift, RecordOut>
  maintenance: MaintenanceEstimate
}

/** 記録のある最初の日〜最後の日（少なくとも asOf まで） */
export function dataRange(d: ResultsInput, asOf: ISODate): { from: ISODate; to: ISODate } {
  const dates = [
    ...d.dailyLogs.map((l) => l.date),
    ...d.topSets.map((s) => s.date),
    ...d.waistLogs.map((l) => l.date),
  ].sort()
  const last = dates.at(-1)
  return { from: dates[0] ?? asOf, to: last !== undefined && last > asOf ? last : asOf }
}

export function buildResults(d: ResultsInput, asOf: ISODate, now: Date = new Date()): Results {
  const s = d.settings
  const { formula, fn, fallbackReason } = resolveFormula(s)
  const ref = referenceWeight(s, d.cycles)
  const { from, to } = dataRange(d, asOf)
  const rec = records(d.topSets, fn)
  return {
    app: 'cycle-tracker',
    kind: 'results',
    generatedAt: now.toISOString(),
    asOf,
    formula: { ...formula, fallbackReason },
    referenceWeight: ref,
    settings: s,
    phases: d.phases,
    judgements: d.cycles.map((c) => judge(s, c, d.dailyLogs, d.topSets, asOf)),
    weekly: weeklySeries(s, ref, d.phases, d.dailyLogs, d.topSets, d.waistLogs, from, to),
    alerts: computeAlerts(s, d.phases, d.dailyLogs, d.topSets, asOf),
    records: Object.fromEntries(
      LIFTS.map((lift) => {
        const r = rec[lift]
        const best = r.bestE1rm
        return [
          lift,
          {
            bestE1rm: best && {
              value: best.value,
              date: best.set.date,
              weight: best.set.weight,
              reps: best.set.reps,
              rpe: best.set.rpe,
            },
            byReps: Object.fromEntries(
              Object.entries(r.byReps).map(([reps, x]) => [reps, x && { date: x.date, weight: x.weight, rpe: x.rpe }]),
            ),
          },
        ]
      }),
    ) as Record<Lift, RecordOut>,
    maintenance: estimateMaintenance(d.dailyLogs, asOf, 14, s.kcalPerKg),
  }
}

const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100)

/** 週次の表。見出しと行（CSV 用） */
export function weeklyTable(rows: WeekRow[]): { header: string[]; rows: (string | number | null)[][] } {
  return {
    header: [
      '週の開始日',
      '週の終了日',
      '週平均体重(kg)',
      '目標体重(kg)',
      'SQ e1RM(kg)',
      'BP e1RM(kg)',
      'DL e1RM(kg)',
      'トータルe1RM(kg)',
      '補正トータル(kg)',
      'ウエスト(cm)',
    ],
    rows: rows
      .filter((r) => r.avgWeight !== null || r.total !== null || r.SQ !== null || r.BP !== null || r.DL !== null || r.waist !== null)
      .map((r) => [
        r.weekStart,
        addDays(r.weekStart, 6),
        r2(r.avgWeight),
        r2(r.targetWeight),
        r2(r.SQ),
        r2(r.BP),
        r2(r.DL),
        r2(r.total),
        r2(r.adjTotal),
        r2(r.waist),
      ]),
  }
}
