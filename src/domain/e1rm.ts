import { LIFTS, type ISODate, type Lift, type TopSet } from './types'
import { addDays, weekStart } from './weeks'

export type LiftValues = Record<Lift, number | null>

export interface Totals extends LiftValues {
  total: number | null
}

/** 5.2 e1RM = 重量 × (1 + (回数 + RIR) / 30)、RIR = 10 − RPE */
export function e1rm(weight: number, reps: number, rpe: number): number {
  const rir = 10 - rpe
  return weight * (1 + (reps + rir) / 30)
}

export function setE1rm(s: TopSet): number {
  return e1rm(s.weight, s.reps, s.rpe)
}

/** 判定用の計算に使えるセット（試合基準で挙げたもの）だけを残す */
export function countable(sets: TopSet[]): TopSet[] {
  return sets.filter((s) => !s.deleted && s.comp)
}

function emptyLifts(): LiftValues {
  return { SQ: null, BP: null, DL: null }
}

function sumLifts(v: LiftValues): number | null {
  if (v.SQ === null || v.BP === null || v.DL === null) return null
  return v.SQ + v.BP + v.DL
}

/** 5.2 週のe1RM：種目ごとに、その週の最大値 */
export function weeklyE1rm(sets: TopSet[]): Map<ISODate, LiftValues> {
  const out = new Map<ISODate, LiftValues>()
  for (const s of countable(sets)) {
    const w = weekStart(s.date)
    const row = out.get(w) ?? emptyLifts()
    row[s.lift] = Math.max(row[s.lift] ?? 0, setE1rm(s))
    out.set(w, row)
  }
  return out
}

/** 記録のない種目を、何週前の値まで引き継ぐか */
export const CARRY_WEEKS = 2

/**
 * 週ごとのトータルe1RM。その週に記録のない種目は直前2週以内の値を引き継ぎ、
 * それも無ければトータルは出さない。
 */
export function weeklyTotal(weekly: Map<ISODate, LiftValues>, week: ISODate): Totals {
  const v = emptyLifts()
  for (const lift of LIFTS) {
    for (let back = 0; back <= CARRY_WEEKS && v[lift] === null; back++) {
      v[lift] = weekly.get(addDays(week, -7 * back))?.[lift] ?? null
    }
  }
  return { ...v, total: sumLifts(v) }
}

function maxInRange(sets: TopSet[], lift: Lift, from: ISODate, to: ISODate): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.lift !== lift || s.date < from || s.date > to) continue
    best = Math.max(best ?? 0, setE1rm(s))
  }
  return best
}

/**
 * 5.2 チェックポイントの値：直近2週の「週のe1RM」の平均。
 * 基準日が月曜など週の途中でも使えるよう、date を最終日とする7日間×2で数える
 * （date が日曜なら暦の週と一致する）。片方の週にしか記録がなければその値を使う。
 */
export function checkpointTotals(sets: TopSet[], date: ISODate): Totals {
  const ok = countable(sets)
  const v = emptyLifts()
  for (const lift of LIFTS) {
    const xs = [
      maxInRange(ok, lift, addDays(date, -6), date),
      maxInRange(ok, lift, addDays(date, -13), addDays(date, -7)),
    ].filter((x): x is number => x !== null)
    v[lift] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  return { ...v, total: sumLifts(v) }
}
