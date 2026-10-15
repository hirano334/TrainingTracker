import { monthsBetween } from './planning'
import type { DailyLog, ISODate, Phase, Settings } from './types'
import { addDays, diffDays } from './weeks'
import { latestPace } from './weight'

const DAYS_PER_MONTH = 365.25 / 12

export type PlannedKind = 'bulk' | 'cut'
export type PaceLevel = 'slow' | 'standard' | 'fast'

export interface PacePreset {
  level: PaceLevel
  label: string
  /** 1週間あたり、体重の何%を増減するか（増量は正、減量は負） */
  pctPerWeek: number
}

/**
 * よくある増減幅。体重に対する割合で持つので、体格が違ってもそのまま使える。
 * 増量は 0.25〜0.75%/週、減量は 0.5〜1.0%/週 が一般的な目安。
 */
export const PACE_PRESETS: Record<PlannedKind, PacePreset[]> = {
  bulk: [
    { level: 'slow', label: 'ゆっくり', pctPerWeek: 0.25 },
    { level: 'standard', label: '標準', pctPerWeek: 0.5 },
    { level: 'fast', label: '速め', pctPerWeek: 0.75 },
  ],
  cut: [
    { level: 'slow', label: 'ゆっくり', pctPerWeek: -0.5 },
    { level: 'standard', label: '標準', pctPerWeek: -0.75 },
    { level: 'fast', label: '速め', pctPerWeek: -1.0 },
  ],
}

export function preset(kind: PlannedKind, level: PaceLevel): PacePreset {
  return PACE_PRESETS[kind].find((p) => p.level === level) as PacePreset
}

/** フェーズの決め方 */
export type PlanHow =
  /** よくある増減幅と週数 */
  | { mode: 'preset'; level: PaceLevel; weeks: number }
  /** n週で x kg（x は増減の大きさ。向きは種別で決まる） */
  | { mode: 'amount'; weeks: number; kg: number }
  /** 終了日と目標体重 */
  | { mode: 'target'; endDate: ISODate; targetWeight: number }

export interface PlanInput {
  kind: PlannedKind
  startDate: ISODate
  startWeight: number
  how: PlanHow
}

export interface PhasePlan {
  startDate: ISODate
  endDate: ISODate
  startWeight: number
  targetWeight: number
  days: number
  /** kg/月。増量は正、減量は負 */
  pacePerMonth: number
  /** 体重に対する %/週 */
  pctPerWeek: number
}

const r1 = (x: number) => Math.round(x * 10) / 10

/** 決め方から、終了日・目標体重・ペースを出す。入力が足りない・おかしいときは null */
export function planPhase(i: PlanInput): PhasePlan | null {
  if (!(i.startWeight > 0)) return null
  const sign = i.kind === 'bulk' ? 1 : -1
  let endDate: ISODate
  let targetWeight: number
  if (i.how.mode === 'target') {
    endDate = i.how.endDate
    targetWeight = i.how.targetWeight
    if (!(targetWeight > 0)) return null
  } else {
    const weeks = i.how.weeks
    if (!(weeks > 0) || !Number.isInteger(weeks)) return null
    endDate = addDays(i.startDate, weeks * 7 - 1)
    const delta =
      i.how.mode === 'preset'
        ? (i.startWeight * preset(i.kind, i.how.level).pctPerWeek * weeks) / 100
        : sign * Math.abs(i.how.kg)
    if (i.how.mode === 'amount' && !(Math.abs(i.how.kg) > 0)) return null
    targetWeight = r1(i.startWeight + delta)
  }
  // 目標ラインは開始日の前日を起点にする（phases.ts の targetWeightOn と同じ数え方）
  const origin = addDays(i.startDate, -1)
  const days = diffDays(origin, endDate)
  if (days < 1) return null
  const delta = targetWeight - i.startWeight
  return {
    startDate: i.startDate,
    endDate,
    startWeight: i.startWeight,
    targetWeight,
    days,
    pacePerMonth: delta / monthsBetween(origin, endDate),
    pctPerWeek: ((delta / i.startWeight) * 100) / (days / 7),
  }
}

/**
 * フェーズの計画ペース (kg/月)。
 * フェーズの作成画面は目標体重から計算したペースを保存するので、保存値があればそれを使う。
 * 保存値の無いフェーズだけ、開始日・開始体重・目標体重から計算する。
 * （手で入れていた頃のフェーズは、目標体重とペースが少し食い違うことがあるが、本人が決めたペースを優先する）
 */
export function phasePace(p: Phase): number | null {
  if (p.targetPacePerMonth !== null) return p.targetPacePerMonth
  const target =
    p.targetWeightMin !== null && p.targetWeightMax !== null
      ? (p.targetWeightMin + p.targetWeightMax) / 2
      : (p.targetWeightMin ?? p.targetWeightMax)
  if (p.startDate === null || p.startWeight === null || target === null) return null
  const origin = addDays(p.startDate, -1)
  return diffDays(origin, p.endDate) >= 1 ? (target - p.startWeight) / monthsBetween(origin, p.endDate) : null
}

/** 1日あたりの、維持カロリーとの差 (kcal)。10kcal 単位 */
export function kcalPerDayFor(pacePerMonth: number, kcalPerKg: number): number {
  return Math.round((pacePerMonth * kcalPerKg) / DAYS_PER_MONTH / 10) * 10
}

export interface PhaseKcal {
  /** 維持カロリーとの差。手入力なら幅があることもある */
  min: number
  max: number
  /** ペースから自動で出したか（手入力でないか） */
  auto: boolean
}

/** フェーズのカロリーの目安。手入力があればそちらを使う */
export function phaseKcal(p: Phase, s: Pick<Settings, 'kcalPerKg'>): PhaseKcal | null {
  if (p.kcalOffsetMin !== null || p.kcalOffsetMax !== null) {
    const a = p.kcalOffsetMin ?? (p.kcalOffsetMax as number)
    const b = p.kcalOffsetMax ?? a
    return { min: Math.min(a, b), max: Math.max(a, b), auto: false }
  }
  const pace = phasePace(p)
  if (pace === null) return null
  const v = kcalPerDayFor(pace, s.kcalPerKg)
  return { min: v, max: v, auto: true }
}

/** 補正を出し始めるまでの日数。前のフェーズの体重が週平均に混ざるうちは比べられない */
export const CORRECTION_WAIT_DAYS = 14
/** この大きさ未満の補正は「計画どおり」とみなす */
export const CORRECTION_MIN_KCAL = 50

export type KcalCorrection =
  | { status: 'wait'; reason: string }
  | { status: 'ok'; planned: number; actual: number; kcal: number }

/**
 * 直近2週の実際のペースが計画とずれていれば、1日あたりの補正量を出す。
 * 補正 = (計画のペース − 実際のペース) × 体重1kgあたりkcal ÷ 30.44
 * kcal が 0 なら計画どおり。フェーズ中でない・記録が足りないときは null。
 */
export function kcalCorrection(
  p: Phase,
  logs: DailyLog[],
  asOf: ISODate,
  s: Pick<Settings, 'kcalPerKg'>,
): KcalCorrection | null {
  const planned = phasePace(p)
  if (planned === null || p.kind === 'checkpoint') return null
  if (p.startDate !== null && diffDays(p.startDate, asOf) < CORRECTION_WAIT_DAYS) {
    return {
      status: 'wait',
      reason:
        p.kind === 'bulk'
          ? '増量の最初の2週は、水分とグリコーゲンが戻って体重が速く増えるので、補正はその後に出します'
          : '始まって2週たつと、実際のペースから補正量を出します',
    }
  }
  const pace = latestPace(logs, asOf)
  if (!pace) return null
  const raw = kcalPerDayFor(planned - pace.perMonth, s.kcalPerKg)
  return { status: 'ok', planned, actual: pace.perMonth, kcal: Math.abs(raw) < CORRECTION_MIN_KCAL ? 0 : raw }
}

/** ペースの表示（例：+1.5kg/月） */
export function paceLabel(pacePerMonth: number): string {
  const v = Math.abs(pacePerMonth).toFixed(1)
  return `${pacePerMonth < 0 && Number(v) !== 0 ? '−' : '+'}${v}kg/月`
}
