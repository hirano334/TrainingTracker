import { activePhases } from './phases'
import type { Cycle, ISODate, Phase } from './types'
import { addDays } from './weeks'

/** フェーズから決まる、サイクルの日付 */
export interface ResolvedCycle extends Cycle {
  /** サイクルに含めたフェーズ。開始日の順 */
  phases: Phase[]
  /** 基準日：最初のフェーズが始まる前日 */
  baseDate: ISODate
  /** 最後のフェーズの終了日。判定はこの日に確定する */
  endDate: ISODate
  /**
   * 落ち幅を測る起点：最後の減量フェーズが始まる前日。
   * 減量フェーズを含まないサイクルでは null（落ち幅は見ない）。
   */
  dropRefDate: ISODate | null
}

/** 日付を直接持っていた旧版のサイクル */
interface LegacyCycle {
  baseDate?: ISODate
  bulkEndDate?: ISODate
  cutEndDate?: ISODate
}

/**
 * 保存されているサイクルを今の形にそろえる。
 * 旧版は基準日〜減量終了日を直接持っていたので、その期間に終わるフェーズを含めたことにする。
 */
export function normalizeCycle(raw: Partial<Cycle> & { id: string; updatedAt: number }, phases: Phase[]): Cycle {
  const old = raw as Partial<Cycle> & LegacyCycle
  const phaseIds =
    raw.phaseIds ??
    (old.baseDate !== undefined && old.cutEndDate !== undefined
      ? activePhases(phases)
          .filter(
            (p) =>
              p.kind !== 'checkpoint' &&
              p.endDate > (old.baseDate as string) &&
              p.endDate <= (old.cutEndDate as string),
          )
          .map((p) => p.id)
      : [])
  return {
    id: raw.id,
    updatedAt: raw.updatedAt,
    ...(raw.deleted ? { deleted: true } : {}),
    name: raw.name ?? '',
    phaseIds,
    baseWeight: raw.baseWeight ?? 0,
    baseTotal: raw.baseTotal ?? null,
    requiredPaceFactor: raw.requiredPaceFactor ?? 1,
    projectionMultiplier: raw.projectionMultiplier ?? 1,
    memo: raw.memo ?? '',
    nextNote: raw.nextNote ?? '',
  }
}

/** サイクルに含められるフェーズ：期間のある増量・減量で、開始日が決まっているもの */
export function usablePhases(phases: Phase[]): Phase[] {
  return activePhases(phases)
    .filter((p) => p.kind !== 'checkpoint' && p.startDate !== null)
    .sort((a, b) => (a.startDate as string).localeCompare(b.startDate as string))
}

/** フェーズから日付を決める。使えるフェーズが1つも無ければ null */
export function resolveCycle(cycle: Cycle, phases: Phase[]): ResolvedCycle | null {
  const mine = usablePhases(phases).filter((p) => cycle.phaseIds.includes(p.id))
  if (mine.length === 0) return null
  const lastCut = mine.filter((p) => p.kind === 'cut').at(-1)
  return {
    ...cycle,
    phases: mine,
    baseDate: addDays(mine[0].startDate as string, -1),
    endDate: mine.reduce((a, p) => (p.endDate > a ? p.endDate : a), mine[0].endDate),
    dropRefDate: lastCut ? addDays(lastCut.startDate as string, -1) : null,
  }
}

/** 判定できるサイクル（基準日の古い順）と、フェーズが選ばれていないサイクル */
export function resolveCycles(
  cycles: Cycle[],
  phases: Phase[],
): { cycles: ResolvedCycle[]; unresolved: Cycle[] } {
  const ok: ResolvedCycle[] = []
  const unresolved: Cycle[] = []
  for (const c of cycles) {
    if (c.deleted) continue
    const r = resolveCycle(c, phases)
    if (r) ok.push(r)
    else unresolved.push(c)
  }
  ok.sort((a, b) => a.baseDate.localeCompare(b.baseDate))
  return { cycles: ok, unresolved }
}
