import type { ISODate, Phase } from './types'
import { addDays, diffDays } from './weeks'

/** 削除済みを除き、終了日順に並べる */
export function activePhases(phases: Phase[]): Phase[] {
  return phases
    .filter((p) => !p.deleted)
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        // 同じ終了日なら、目印の判定行を後ろに
        Number(a.kind === 'checkpoint') - Number(b.kind === 'checkpoint'),
    )
}

/** その日が属する増量/減量フェーズ。判定行は期間を持たない目印なので対象外 */
export function phaseAt(phases: Phase[], date: ISODate): Phase | null {
  for (const p of activePhases(phases)) {
    if (p.kind === 'checkpoint') continue
    if ((p.startDate === null || p.startDate <= date) && date <= p.endDate) return p
  }
  return null
}

/** フェーズの目標体重。範囲指定のときは中央値 */
export function targetWeightOf(p: Phase): number | null {
  if (p.targetWeightMin === null || p.targetWeightMax === null) {
    return p.targetWeightMin ?? p.targetWeightMax
  }
  return (p.targetWeightMin + p.targetWeightMax) / 2
}

/**
 * その日の目標体重ライン上の値。
 * 開始体重（開始日の前日時点）から目標体重（終了日時点）まで直線で補間する。
 * 開始日か開始体重が無いフェーズは、目標体重で一定とする。
 */
export function targetWeightOn(p: Phase, date: ISODate): number | null {
  const target = targetWeightOf(p)
  if (target === null) return null
  if (p.startDate === null || p.startWeight === null) return target
  const origin = addDays(p.startDate, -1)
  const span = diffDays(origin, p.endDate)
  if (span <= 0) return target
  const t = Math.min(1, Math.max(0, diffDays(origin, date) / span))
  return p.startWeight + (target - p.startWeight) * t
}

export function targetWeightAt(phases: Phase[], date: ISODate): number | null {
  const p = phaseAt(phases, date)
  return p ? targetWeightOn(p, date) : null
}

export interface PhasePair {
  bulk: Phase
  cut: Phase
}

/**
 * 「増量 → 直後の減量」の組を古い順に返す。
 * サイクルを申告するときに、日付の候補を埋めるのに使う。
 */
export function findPhasePairs(phases: Phase[]): PhasePair[] {
  const seq = activePhases(phases).filter((p) => p.kind !== 'checkpoint')
  const out: PhasePair[] = []
  for (let i = 0; i + 1 < seq.length; i++) {
    if (seq[i].kind === 'bulk' && seq[i + 1].kind === 'cut') out.push({ bulk: seq[i], cut: seq[i + 1] })
  }
  return out
}
