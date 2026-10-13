/** 'YYYY-MM-DD' */
export type ISODate = string

export type Lift = 'SQ' | 'BP' | 'DL'
export const LIFTS: Lift[] = ['SQ', 'BP', 'DL']

/** 同期用。削除は行を消さず deleted を立てる */
export interface SyncMeta {
  updatedAt: number
  deleted?: boolean
}

/** 要件定義 2章。計算に使う数値はすべてここに置く */
export interface Settings extends SyncMeta {
  id: 'settings'
  heightCm: number
  /** 基準日・基準体重は、サイクルが1つも無いときの体重補正の基準 */
  baseDate: ISODate
  baseWeight: number
  standard74: number
  standard83: number
  mainMeetDate: ISODate | null
  springMeetDate: ISODate | null
  bodyFatLimitPct: number
  allometricExponent: number
  maintenanceKcal: number | null
  /** 維持カロリーの推定に使う、体重1kgあたりのエネルギー */
  kcalPerKg: number

  /** 推定1RMに使う式（組み込みの id か customFormulas の id） */
  e1rmFormulaId: string
  customFormulas: Formula[]

  /** 5.4 「境界」の下限（必要ペースに掛ける） */
  borderlineFactor: number
  /** 5.5 落ち幅の閾値(kg) */
  dropNormalMaxKg: number
  dropGreyMaxKg: number
  /** 5.7 83kg級ルートの着地目標と月数 */
  route83TargetsKg: number[]
  route83Months: number
  /** 5.8 アラート閾値 (kg/月, %) */
  bulkPaceMaxPerMonth: number
  bulkPaceMinPerMonth: number
  cutPaceMaxPerMonth: number
  e1rmDropAlertPct: number
}

/** 推定1RMの式。expr は domain/expr.ts の評価器で解釈する */
export interface Formula {
  id: string
  name: string
  expr: string
}

/**
 * 判定の対象にする1サイクル。フェーズ表から割り出さず、利用者が申告する。
 * 5.4 の係数はサイクルごとに違う（第1サイクルは残り約2.5サイクルを前提にした値）。
 */
export interface Cycle extends SyncMeta {
  id: string
  name: string
  baseDate: ISODate
  baseWeight: number
  baseTotal: number | null
  bulkEndDate: ISODate
  cutEndDate: ISODate
  /** 5.4 必要ペースの係数 */
  requiredPaceFactor: number
  /** 5.4 本命大会時点の予測に使う倍率 */
  projectionMultiplier: number
}

export type PhaseKind = 'bulk' | 'cut' | 'checkpoint'

/** 要件定義 3章 */
export interface Phase extends SyncMeta {
  id: string
  name: string
  kind: PhaseKind
  /** null は「〜終了日」のみ決まっているフェーズ */
  startDate: ISODate | null
  endDate: ISODate
  startWeight: number | null
  targetWeightMin: number | null
  targetWeightMax: number | null
  /** kg/月。増量は正、減量は負 */
  targetPacePerMonth: number | null
  /** 表示用（例: "+1.5kg/月"） */
  paceNote: string
  /** 維持カロリーからの差(kcal)。絶対値の小さい方が Min */
  kcalOffsetMin: number | null
  kcalOffsetMax: number | null
}

/** 4.1 */
export interface DailyLog extends SyncMeta {
  date: ISODate
  weight: number
  bodyFatPct: number | null
  kcal: number | null
  proteinG: number | null
}

/** 4.2 */
export interface WaistLog extends SyncMeta {
  date: ISODate
  waistCm: number
}

/** 4.3 */
export interface TopSet extends SyncMeta {
  id: string
  date: ISODate
  lift: Lift
  weight: number
  reps: number
  rpe: number
  /** 試合基準で挙げたか */
  comp: boolean
  memo: string
}

/** 4.4 */
export interface Checkpoint extends SyncMeta {
  date: ISODate
  maxSQ: number | null
  maxBP: number | null
  maxDL: number | null
  sleepHours: number | null
  /** 主観的な疲労度 1〜5 */
  fatigue: number | null
  memo: string
}

export interface AppData {
  settings: Settings[]
  phases: Phase[]
  dailyLogs: DailyLog[]
  waistLogs: WaistLog[]
  topSets: TopSet[]
  checkpoints: Checkpoint[]
  cycles: Cycle[]
}

export const TABLES = [
  'settings',
  'phases',
  'dailyLogs',
  'waistLogs',
  'topSets',
  'checkpoints',
  'cycles',
] as const
export type TableName = (typeof TABLES)[number]

/** 各テーブルの主キー */
export const KEY_OF: { [K in TableName]: keyof AppData[K][number] & string } = {
  settings: 'id',
  phases: 'id',
  dailyLogs: 'date',
  waistLogs: 'date',
  topSets: 'id',
  checkpoints: 'date',
  cycles: 'id',
}
