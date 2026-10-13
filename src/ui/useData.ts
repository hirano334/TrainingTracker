import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { getMeta, readAll, SETUP_DONE } from '../db/db'
import { normalizeSettings } from '../domain/defaults'
import { resolveFormula, type ResolvedFormula } from '../domain/formulas'
import { normalizeCycle, resolveCycles, type ResolvedCycle } from '../domain/cycles'
import { referenceWeight } from '../domain/judgement'
import { activePhases } from '../domain/phases'
import type { Checkpoint, Cycle, DailyLog, Phase, Settings, TopSet, WaistLog } from '../domain/types'
import { getSyncState, subscribeSync, type SyncState } from '../sync/syncEngine'

export interface Data {
  settings: Settings
  /** 終了日順 */
  phases: Phase[]
  /** 以下は日付の古い順、削除済みは除外 */
  dailyLogs: DailyLog[]
  waistLogs: WaistLog[]
  topSets: TopSet[]
  checkpoints: Checkpoint[]
  /** フェーズが決まっているサイクル。基準日の古い順 */
  cycles: ResolvedCycle[]
  /** フェーズが選ばれていない（または消えた）サイクル */
  unresolvedCycles: Cycle[]
  /** 設定で選ばれている推定1RMの式 */
  formula: ResolvedFormula
  /** グラフの体重補正に使う基準体重 */
  refWeight: number
}

const live = <T extends { deleted?: boolean; date: string }>(rows: T[]) =>
  rows.filter((r) => !r.deleted).sort((a, b) => a.date.localeCompare(b.date))

/** 保存されている記録。読み込み中は undefined */
export function useData(): Data | undefined {
  const all = useLiveQuery(() => readAll(), [])
  return useMemo(() => {
    if (!all) return undefined
    // 旧版で保存した設定を今の形に読み替える
    const settings = normalizeSettings(all.settings.find((s) => !s.deleted))
    const phases = activePhases(all.phases)
    // 旧版のサイクル（日付を直接持つ）も、フェーズから組んだ形に読み替える
    const { cycles, unresolved } = resolveCycles(
      all.cycles.map((c) => normalizeCycle(c, phases)),
      phases,
    )
    return {
      settings,
      phases,
      dailyLogs: live(all.dailyLogs),
      waistLogs: live(all.waistLogs),
      topSets: live(all.topSets),
      checkpoints: live(all.checkpoints),
      cycles,
      unresolvedCycles: unresolved,
      formula: resolveFormula(settings),
      refWeight: referenceWeight(settings, cycles),
    }
  }, [all])
}

export function useMeta<T>(key: string): T | undefined {
  return useLiveQuery(() => getMeta<T>(key), [key])
}

/** 初回セットアップを済ませたか。読み込み中は null */
export function useSetupDone(): boolean | null {
  return useLiveQuery(async () => (await getMeta<boolean>(SETUP_DONE)) === true, [], null)
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState)
}
