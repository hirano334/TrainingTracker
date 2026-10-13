import { DEFAULT_CYCLE_FACTORS, DEFAULT_SETTINGS } from './defaults'
import type { Cycle, Phase, Settings } from './types'

// 要件定義（cycle_tracker_requirements.md）どおりの設定例。74kg級と83kg級で迷っている人の、
// 2026年12月〜2027年2月の第1サイクル。テストと、開発用のサンプルデータに使う。
// 実際の利用者の初期値にはしない（初期値は defaults.ts、最初の設定は setup.ts が作る）。

/** 要件定義 2章 */
export const EXAMPLE_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  heightCm: 178,
  baseDate: '2026-11-30',
  baseWeight: 72.5,
  goalTotal: 540,
  classChoice: true,
  lowerClassName: '74kg級',
  upperClassName: '83kg級',
  upperClassStandard: 570,
  upperLandingTargetsKg: [81, 82],
  upperRouteMonths: 7,
  classNote: '74級は体脂肪11〜12%を維持、83級は大会時に約17%',
  mainMeetDate: '2027-10-01',
  // 要件定義 5.2 の式
  e1rmFormulaId: 'epley',
}

/** 要件定義 3章 */
export const EXAMPLE_PHASES: Phase[] = [
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

/** 要件定義 1章の第1サイクル：増量1 → 減量1 */
export const EXAMPLE_CYCLES: Cycle[] = [
  {
    id: 'cycle-1',
    updatedAt: 0,
    name: '第1サイクル',
    phaseIds: ['bulk-1', 'cut-1'],
    baseWeight: 72.5,
    baseTotal: null,
    ...DEFAULT_CYCLE_FACTORS,
    memo: '',
    nextNote: '',
  },
]
