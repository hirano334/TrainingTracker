import type { Settings } from './types'

// 初期値は updatedAt: 0 にする。別の端末やバックアップに実データがあれば必ずそちらが勝つ

/**
 * 何も設定していない状態。人や時期で決まる値（体重・目標・階級・大会日・フェーズ・サイクル）は
 * ここには置かず、初回セットアップ（setup.ts）で聞いて作る。
 */
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: 0,
  heightCm: null,
  baseDate: '2026-01-01',
  baseWeight: 70,
  goalTotal: null,
  classChoice: false,
  lowerClassName: 'いまの階級',
  upperClassName: '上の階級',
  upperClassStandard: null,
  upperLandingTargetsKg: [],
  upperRouteMonths: null,
  classNote: '',
  mainMeetDate: null,
  springMeetDate: null,
  bodyFatLimitPct: 17,
  allometricExponent: 2 / 3,
  maintenanceKcal: null,
  kcalPerKg: 7700,
  e1rmFormulaId: 'rts',
  customFormulas: [],
  borderlineFactor: 0.5,
  dropNormalMaxPct: 2,
  dropGreyMaxPct: 3,
  bulkPaceMaxPerMonth: 2.0,
  bulkPaceMinPerMonth: 1.0,
  cutPaceMaxPerMonth: 2.0,
  e1rmDropAlertPct: 5,
  show: { waist: true, nutrition: true, bodyFat: true, checkpoint: true, heartRate: false },
}

/** 5.4 の係数。本命大会の日付が分からないときの値（残り約2.5サイクルで伸びが 1 : 0.8 : 0.7 と鈍る仮定） */
export const DEFAULT_CYCLE_FACTORS = { requiredPaceFactor: 0.4, projectionMultiplier: 2.5 }

/** 旧版の設定にあった項目 */
interface LegacySettings {
  standard74?: number
  standard83?: number
  route83TargetsKg?: number[]
  route83Months?: number
  dropNormalMaxKg?: number
  dropGreyMaxKg?: number
}

/** 旧版の落ち幅の閾値(kg)を割合に直すときの、基準にするトータル(kg)。10kg → 2% */
const LEGACY_DROP_REFERENCE_KG = 500

/**
 * 保存されている設定を今の形にそろえる。
 * 新しい項目が無ければ初期値で補い、74kg級/83kg級が固定だった旧版の設定は
 * 階級の名前や標準記録として読み替える（判定の内容は変えない）。
 */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS
  const old = raw as Partial<Settings> & LegacySettings
  const legacy: Partial<Settings> =
    old.standard74 !== undefined && raw.goalTotal === undefined
      ? {
          goalTotal: old.standard74,
          classChoice: true,
          lowerClassName: '74kg級',
          upperClassName: '83kg級',
          upperClassStandard: old.standard83 ?? null,
          upperLandingTargetsKg: old.route83TargetsKg ?? [],
          upperRouteMonths: old.route83Months ?? null,
          classNote: '74級は体脂肪11〜12%を維持、83級は大会時に約17%',
          dropNormalMaxPct: ((old.dropNormalMaxKg ?? 10) / LEGACY_DROP_REFERENCE_KG) * 100,
          dropGreyMaxPct: ((old.dropGreyMaxKg ?? 15) / LEGACY_DROP_REFERENCE_KG) * 100,
        }
      : {}
  return {
    ...DEFAULT_SETTINGS,
    // 式を選べるようになる前の記録は Epley で計算していた。初期値が変わっても、既存の人の数字は動かさない
    e1rmFormulaId: 'epley',
    ...legacy,
    ...raw,
    show: { ...DEFAULT_SETTINGS.show, ...raw.show },
  }
}
