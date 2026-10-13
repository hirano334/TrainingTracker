import type { ISODate } from './types'
import { diffDays } from './weeks'

const DAYS_PER_MONTH = 365.25 / 12

/** a から b までの月数（小数） */
export function monthsBetween(a: ISODate, b: ISODate): number {
  return diffDays(a, b) / DAYS_PER_MONTH
}

/**
 * k 番目（1始まり）のサイクルで見込む伸びの、1番目に対する比。
 * 要件定義 5.4 の仮定（1 : 0.8 : 0.7）を先頭に置き、その先は1サイクルごとに1割ずつ鈍るとする。
 */
export function gainWeight(k: number): number {
  const head = [1, 0.8, 0.7]
  return k <= head.length ? head[k - 1] : head[head.length - 1] * Math.pow(0.9, k - head.length)
}

export interface FactorSuggestion {
  /** 基準日から本命大会までに入るサイクル数（このサイクルを含む。小数） */
  cycles: number
  requiredPaceFactor: number
  projectionMultiplier: number
}

/**
 * 5.4 の係数を、本命大会の日付とサイクルの長さから出す。
 * 倍率 = 大会までの各サイクルの伸びの比の合計（端数のサイクルは按分）、係数 = 1 / 倍率。
 * 大会がこのサイクルの終わりより前なら、このサイクルだけで届く必要があるので 1。
 */
export function suggestFactors(
  cycle: { baseDate: ISODate; cutEndDate: ISODate },
  meetDate: ISODate | null,
): FactorSuggestion | null {
  if (meetDate === null) return null
  const length = diffDays(cycle.baseDate, cycle.cutEndDate)
  if (length <= 0) return null
  const cycles = Math.max(1, diffDays(cycle.baseDate, meetDate) / length)
  const whole = Math.floor(cycles)
  let multiplier = 0
  for (let k = 1; k <= whole; k++) multiplier += gainWeight(k)
  multiplier += (cycles - whole) * gainWeight(whole + 1)
  const round = (x: number) => Math.round(x * 100) / 100
  return { cycles, requiredPaceFactor: round(1 / multiplier), projectionMultiplier: round(multiplier) }
}
