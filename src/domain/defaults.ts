import type { Cycle, Phase, Settings } from './types'

// 初期値は updatedAt: 0 にする。別の端末やバックアップに実データがあれば必ずそちらが勝つ

/** 要件定義 2章の初期値 */
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: 0,
  heightCm: 178,
  baseDate: '2026-11-30',
  baseWeight: 72.5,
  standard74: 540,
  standard83: 570,
  mainMeetDate: '2027-10-01',
  springMeetDate: null,
  bodyFatLimitPct: 17,
  allometricExponent: 2 / 3,
  maintenanceKcal: null,
  kcalPerKg: 7700,
  e1rmFormulaId: 'epley',
  customFormulas: [],
  borderlineFactor: 0.5,
  dropNormalMaxKg: 10,
  dropGreyMaxKg: 15,
  route83TargetsKg: [81, 82],
  route83Months: 7,
  bulkPaceMaxPerMonth: 2.0,
  bulkPaceMinPerMonth: 1.0,
  cutPaceMaxPerMonth: 2.0,
  e1rmDropAlertPct: 5,
}

/** 要件定義 3章の初期値 */
export const DEFAULT_PHASES: Phase[] = [
  {
    id: 'nf-cut',
    updatedAt: 0,
    name: 'NF減量',
    kind: 'cut',
    startDate: null,
    endDate: '2026-11-30',
    startWeight: 74.0,
    targetWeightMin: 72.5,
    targetWeightMax: 72.5,
    // −0.3kg/週 × 30/7
    targetPacePerMonth: -1.3,
    paceNote: '−0.25〜0.35kg/週',
    kcalOffsetMin: -200,
    kcalOffsetMax: -300,
  },
  {
    id: 'bulk-1',
    updatedAt: 0,
    name: '増量1',
    kind: 'bulk',
    startDate: '2026-12-01',
    endDate: '2027-01-31',
    startWeight: 72.5,
    targetWeightMin: 75.5,
    targetWeightMax: 75.5,
    targetPacePerMonth: 1.5,
    paceNote: '+1.5kg/月',
    kcalOffsetMin: 400,
    kcalOffsetMax: 500,
  },
  {
    id: 'cut-1',
    updatedAt: 0,
    name: '減量1',
    kind: 'cut',
    startDate: '2027-02-01',
    endDate: '2027-02-28',
    startWeight: 75.5,
    targetWeightMin: 73.7,
    targetWeightMax: 74.0,
    targetPacePerMonth: -1.5,
    paceNote: '−1.5kg/月',
    kcalOffsetMin: -400,
    kcalOffsetMax: -500,
  },
  {
    id: 'judge-1',
    updatedAt: 0,
    name: '判定',
    kind: 'checkpoint',
    startDate: '2027-02-28',
    endDate: '2027-02-28',
    startWeight: null,
    targetWeightMin: null,
    targetWeightMax: null,
    targetPacePerMonth: null,
    paceNote: '',
    kcalOffsetMin: null,
    kcalOffsetMax: null,
  },
]

/** 5.4 の係数の初期値。10月までの残り約2.5サイクルで伸びが 1 : 0.8 : 0.7 と鈍る仮定 */
export const DEFAULT_CYCLE_FACTORS = { requiredPaceFactor: 0.4, projectionMultiplier: 2.5 }

/** 要件定義 1章の第1サイクル */
export const DEFAULT_CYCLES: Cycle[] = [
  {
    id: 'cycle-1',
    updatedAt: 0,
    name: '第1サイクル',
    baseDate: '2026-11-30',
    baseWeight: 72.5,
    baseTotal: null,
    bulkEndDate: '2027-01-31',
    cutEndDate: '2027-02-28',
    ...DEFAULT_CYCLE_FACTORS,
  },
]
