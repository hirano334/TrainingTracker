import { compile, ExprError } from './expr'
import type { Formula, Settings } from './types'

export type { Formula }

/** 重量・回数・RPE から推定1RMを出す関数 */
export type E1rmFn = (weight: number, reps: number, rpe: number) => number

/**
 * 式で使える変数。
 * w: 重量、reps: 回数、rpe: RPE、rir: 残り回数 (10 − rpe)、r: 実効回数 (reps + rir)
 */
export const FORMULA_VARS = ['w', 'reps', 'rpe', 'rir', 'r'] as const

/** 組み込みの式。どれも限界まで挙げた場合の回数として r（回数 + RIR）を使う */
export const BUILTIN_FORMULAS: Formula[] = [
  // 要件定義 5.2 の式。フォールバックにも使うので先頭に置く
  { id: 'epley', name: 'Epley', expr: 'w * (1 + r / 30)' },
  // RPE を使う人に広く使われている換算表。1回・RPE10 でちょうど実重量になる
  { id: 'rts', name: 'RTS の表', expr: 'w / rts(r)' },
  { id: 'epley3', name: 'Epley（1回3%）', expr: 'w * (1 + 0.03 * r)' },
  { id: 'brzycki', name: 'Brzycki', expr: 'w * 36 / (37 - r)' },
  { id: 'lombardi', name: 'Lombardi', expr: 'w * r ^ 0.10' },
  { id: 'oconner', name: "O'Conner", expr: 'w * (1 + r / 40)' },
  { id: 'wathan', name: 'Wathan', expr: '100 * w / (48.8 + 53.8 * exp(-0.075 * r))' },
]

export const DEFAULT_FORMULA_ID = 'epley'

const cache = new Map<string, E1rmFn>()

/** 式を関数にする。式が不正なら ExprError */
export function compileFormula(expr: string): E1rmFn {
  const hit = cache.get(expr)
  if (hit) return hit
  const f = compile(expr, FORMULA_VARS)
  const fn: E1rmFn = (w, reps, rpe) => {
    const rir = 10 - rpe
    return f({ w, reps, rpe, rir, r: reps + rir })
  }
  cache.set(expr, fn)
  return fn
}

export const epley: E1rmFn = compileFormula(BUILTIN_FORMULAS[0].expr)

/**
 * 式として使えるか確かめる。記録しうる範囲（1〜5回、RPE 6〜10）のすべてで
 * 正の有限値になること。問題があれば理由を返し、無ければ null。
 */
export function validateFormula(expr: string): string | null {
  let fn: E1rmFn
  try {
    fn = compileFormula(expr)
  } catch (e) {
    if (e instanceof ExprError) return e.message
    throw e
  }
  for (let reps = 1; reps <= 5; reps++) {
    for (let rpe = 6; rpe <= 10; rpe += 0.5) {
      const x = fn(100, reps, rpe)
      if (!Number.isFinite(x) || x <= 0) {
        return `${reps}回・RPE${rpe} で値が出ません（結果：${String(x)}）`
      }
    }
  }
  return null
}

export function allFormulas(s: Pick<Settings, 'customFormulas'>): Formula[] {
  return [...BUILTIN_FORMULAS, ...s.customFormulas]
}

export interface ResolvedFormula {
  formula: Formula
  fn: E1rmFn
  /** 選ばれた式が使えず Epley に戻したとき、その理由 */
  fallbackReason: string | null
}

/** 設定で選ばれている式。見つからない・壊れている場合は Epley に戻す */
export function resolveFormula(s: Pick<Settings, 'customFormulas' | 'e1rmFormulaId'>): ResolvedFormula {
  const fallback = (reason: string): ResolvedFormula => ({
    formula: BUILTIN_FORMULAS[0],
    fn: epley,
    fallbackReason: reason,
  })
  const formula = allFormulas(s).find((f) => f.id === s.e1rmFormulaId)
  if (!formula) return fallback('選択した式が見つかりません')
  const problem = validateFormula(formula.expr)
  if (problem) return fallback(`「${formula.name}」が使えません：${problem}`)
  return { formula, fn: compileFormula(formula.expr), fallbackReason: null }
}
