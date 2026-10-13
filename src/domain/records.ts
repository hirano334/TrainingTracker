import { countable } from './e1rm'
import type { E1rmFn } from './formulas'
import { LIFTS, type Lift, type TopSet } from './types'

export const RECORD_REPS = [1, 2, 3, 4, 5] as const

export interface LiftRecords {
  /** 推定1RMが最も高いセット */
  bestE1rm: { value: number; set: TopSet } | null
  /** 回数ごとの最高重量のセット */
  byReps: Record<number, TopSet | null>
}

/** 種目別の自己ベスト。試合基準で挙げたセットだけを数える */
export function records(sets: TopSet[], fn: E1rmFn): Record<Lift, LiftRecords> {
  const out = {} as Record<Lift, LiftRecords>
  for (const lift of LIFTS) {
    out[lift] = { bestE1rm: null, byReps: Object.fromEntries(RECORD_REPS.map((r) => [r, null])) }
  }
  // 同じ値なら先に出した方を残す
  for (const s of [...countable(sets)].sort((a, b) => a.date.localeCompare(b.date))) {
    const rec = out[s.lift]
    const value = fn(s.weight, s.reps, s.rpe)
    if (!rec.bestE1rm || value > rec.bestE1rm.value) rec.bestE1rm = { value, set: s }
    const cur = rec.byReps[s.reps]
    if (s.reps in rec.byReps && (!cur || s.weight > cur.weight)) rec.byReps[s.reps] = s
  }
  return out
}

export type RecordKind = 'e1rm' | 'weight'

/**
 * これから保存するセットが、それまでのベストを更新するか。
 * その種目（その回数）で初めての記録は、比べる相手がいないので更新とは数えない。
 */
export function brokenRecords(before: TopSet[], next: Omit<TopSet, 'updatedAt'>, fn: E1rmFn): RecordKind[] {
  if (!next.comp) return []
  const rec = records(
    before.filter((s) => s.id !== next.id),
    fn,
  )[next.lift]
  const out: RecordKind[] = []
  if (rec.bestE1rm && fn(next.weight, next.reps, next.rpe) > rec.bestE1rm.value) out.push('e1rm')
  const same = rec.byReps[next.reps]
  if (same && next.weight > same.weight) out.push('weight')
  return out
}
