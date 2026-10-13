import { DEFAULT_CYCLE_FACTORS } from './defaults'
import { suggestFactors } from './planning'
import type { Cycle, ISODate, Phase, Settings, ShowFlags } from './types'
import { addDays, diffDays } from './weeks'

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
  /** 増量・減量のペース (kg/月)。どちらも正の値 */
  bulkPerMonth: number
  cutPerMonth: number
  show: ShowFlags
}

type New<T> = Omit<T, 'updatedAt' | 'deleted'>

export interface SetupPlan {
  settings: Partial<Settings>
  phases: New<Phase>[]
  cycle: New<Cycle>
}

const r1 = (x: number) => Math.round(x * 10) / 10
const signed = (x: number) => `${x < 0 ? '−' : '+'}${Math.abs(x)}kg/月`

/** 答えから、設定・フェーズ表（増量 → 減量）・最初のサイクルを作る */
export function buildSetup(a: SetupAnswers): SetupPlan {
  const bulkStart = addDays(a.baseDate, 1)
  const bulkEnd = addDays(a.baseDate, a.bulkWeeks * 7)
  const cutStart = addDays(bulkEnd, 1)
  const cutEnd = addDays(bulkEnd, a.cutWeeks * 7)
  const perDay = 1 / (365.25 / 12)
  const bulkTarget = r1(a.weight + a.bulkPerMonth * diffDays(a.baseDate, bulkEnd) * perDay)
  const cutTarget = r1(bulkTarget - a.cutPerMonth * diffDays(bulkEnd, cutEnd) * perDay)

  const phase = (
    id: string,
    name: string,
    kind: 'bulk' | 'cut',
    startDate: ISODate,
    endDate: ISODate,
    startWeight: number,
    target: number,
    pace: number,
  ): New<Phase> => ({
    id,
    name,
    kind,
    startDate,
    endDate,
    startWeight,
    targetWeightMin: target,
    targetWeightMax: target,
    targetPacePerMonth: pace,
    paceNote: signed(pace),
    // 維持カロリーからの差の目安。1kg ≒ 7700kcal として月ペースから出し、50kcal 単位に丸めた幅
    kcalOffsetMin: Math.round((pace * 7700) / 30.44 / 50) * 50 - Math.sign(pace) * 50,
    kcalOffsetMax: Math.round((pace * 7700) / 30.44 / 50) * 50 + Math.sign(pace) * 50,
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
      phase('bulk-1', '増量1', 'bulk', bulkStart, bulkEnd, a.weight, bulkTarget, a.bulkPerMonth),
      phase('cut-1', '減量1', 'cut', cutStart, cutEnd, bulkTarget, cutTarget, -a.cutPerMonth),
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
