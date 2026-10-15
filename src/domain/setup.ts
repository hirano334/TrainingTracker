import { DEFAULT_CYCLE_FACTORS } from './defaults'
import { suggestFactors } from './planning'
import type { Cycle, ISODate, Phase, Settings, ShowFlags } from './types'
import { addDays } from './weeks'
import { paceLabel, planPhase, type PaceLevel, type PhasePlan } from './phasePlan'

/** 初回セットアップで聞くこと */
export interface SetupAnswers {
  /** いまの体重（基準体重） */
  weight: number
  /** 目標トータル（標準記録など） */
  goalTotal: number
  /** いまのトータル。分からなければ null（あとでサイクルに入れる） */
  baseTotal: number | null
  mainMeetDate: ISODate | null
  /** 階級を迷っているか */
  classChoice: boolean
  lowerClassName: string
  upperClassName: string
  upperClassStandard: number | null
  upperLandingTargetsKg: number[]
  /** 基準日。この翌日から増量を始める */
  baseDate: ISODate
  bulkWeeks: number
  cutWeeks: number
  /** 増量・減量の増減幅（よくある幅から選ぶ） */
  bulkLevel: PaceLevel
  cutLevel: PaceLevel
  show: ShowFlags
}

type New<T> = Omit<T, 'updatedAt' | 'deleted'>

export interface SetupPlan {
  settings: Partial<Settings>
  phases: New<Phase>[]
  cycle: New<Cycle>
}

/** 答えから、設定・フェーズ表（増量 → 減量）・最初のサイクルを作る */
export function buildSetup(a: SetupAnswers): SetupPlan {
  const bulk = planPhase({
    kind: 'bulk',
    startDate: addDays(a.baseDate, 1),
    startWeight: a.weight,
    how: { mode: 'preset', level: a.bulkLevel, weeks: a.bulkWeeks },
  }) as PhasePlan
  const cut = planPhase({
    kind: 'cut',
    startDate: addDays(bulk.endDate, 1),
    startWeight: bulk.targetWeight,
    how: { mode: 'preset', level: a.cutLevel, weeks: a.cutWeeks },
  }) as PhasePlan
  const cutEnd = cut.endDate

  // カロリーの目安は保存せず、ペースから自動で出す（phasePlan.ts の phaseKcal）
  const phase = (id: string, name: string, kind: 'bulk' | 'cut', p: PhasePlan): New<Phase> => ({
    id,
    name,
    kind,
    startDate: p.startDate,
    endDate: p.endDate,
    startWeight: p.startWeight,
    targetWeightMin: p.targetWeight,
    targetWeightMax: p.targetWeight,
    targetPacePerMonth: p.pacePerMonth,
    paceNote: paceLabel(p.pacePerMonth),
    kcalOffsetMin: null,
    kcalOffsetMax: null,
  })

  const dates = { baseDate: a.baseDate, cutEndDate: cutEnd }
  const factors = suggestFactors(dates, a.mainMeetDate)
  return {
    settings: {
      baseDate: a.baseDate,
      baseWeight: a.weight,
      goalTotal: a.goalTotal,
      mainMeetDate: a.mainMeetDate,
      classChoice: a.classChoice,
      ...(a.classChoice
        ? {
            lowerClassName: a.lowerClassName,
            upperClassName: a.upperClassName,
            upperClassStandard: a.upperClassStandard,
            upperLandingTargetsKg: a.upperLandingTargetsKg,
          }
        : {}),
      show: a.show,
    },
    phases: [
      phase('bulk-1', '増量1', 'bulk', bulk),
      phase('cut-1', '減量1', 'cut', cut),
    ],
    cycle: {
      id: 'cycle-1',
      name: '第1サイクル',
      phaseIds: ['bulk-1', 'cut-1'],
      baseWeight: a.weight,
      baseTotal: a.baseTotal,
      memo: '',
      nextNote: '',
      requiredPaceFactor: factors?.requiredPaceFactor ?? DEFAULT_CYCLE_FACTORS.requiredPaceFactor,
      projectionMultiplier: factors?.projectionMultiplier ?? DEFAULT_CYCLE_FACTORS.projectionMultiplier,
    },
  }
}
