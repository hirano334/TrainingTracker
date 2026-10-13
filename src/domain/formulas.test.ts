import { describe, expect, it } from 'vitest'
import { EXAMPLE_SETTINGS } from './example'
import { compile, ExprError } from './expr'
import { BUILTIN_FORMULAS, compileFormula, epley, resolveFormula, validateFormula } from './formulas'

const ev = (src: string, vars: Record<string, number> = {}) => compile(src, Object.keys(vars))(vars)

describe('数式の評価器', () => {
  it('四則演算と優先順位', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('10 - 4 - 3')).toBe(3)
    expect(ev('24 / 4 / 2')).toBe(3)
    expect(ev('.5 + 1.25')).toBe(1.75)
  })
  it('べき乗は右結合、単項マイナスより強い', () => {
    expect(ev('2 ^ 3 ^ 2')).toBe(512)
    expect(ev('-2 ^ 2')).toBe(-4)
    expect(ev('2 ^ -1')).toBe(0.5)
    expect(ev('--3')).toBe(3)
  })
  it('変数と関数', () => {
    expect(ev('w * (1 + r / 30)', { w: 100, r: 5 })).toBeCloseTo(116.667, 3)
    expect(ev('max(1, 5, 3) + min(4, 2)')).toBe(7)
    expect(ev('pow(2, 10)')).toBe(1024)
    expect(ev('sqrt(abs(-16))')).toBe(4)
    expect(ev('ln(exp(2))')).toBeCloseTo(2)
    expect(ev('log10(1000)')).toBeCloseTo(3)
  })
  it('全角や × ÷ で打っても通る', () => {
    expect(ev('ｗ × （１ ＋ ｒ ÷ ３０）', { w: 100, r: 5 })).toBeCloseTo(116.667, 3)
  })
  it('壊れた式は拒否する', () => {
    for (const bad of ['', '1 +', '(1 + 2', '1 2', '* 3', 'w +* 2', 'min()', 'pow(1)', 'exp(1, 2)', '1 + 2)', '3 $ 4']) {
      expect(() => ev(bad, { w: 1 }), bad).toThrow(ExprError)
    }
    expect(() => ev('1+'.repeat(150) + '1')).toThrow(/200文字/)
  })
  it('許可していない名前は変数としても関数としても通らない', () => {
    for (const bad of [
      'constructor',
      '__proto__',
      'toString',
      'window',
      'globalThis',
      'alert(1)',
      'constructor(1)',
      'w.constructor',
      'w["x"]',
      'eval(1)',
      'Math',
      'x',
    ]) {
      expect(() => ev(bad, { w: 1 }), bad).toThrow(ExprError)
    }
  })
})

describe('e1RM の式', () => {
  const f = (id: string) => compileFormula(BUILTIN_FORMULAS.find((x) => x.id === id)!.expr)

  it('Epley は要件定義 5.2 の式', () => {
    expect(epley(100, 3, 8)).toBeCloseTo(100 * (1 + 5 / 30))
    expect(epley(150, 2, 8.5)).toBeCloseTo(150 * (1 + 3.5 / 30))
  })
  it('各式を手計算と照合（100kg × 3回 × RPE8 → 実効5回）', () => {
    expect(f('brzycki')(100, 3, 8)).toBeCloseTo((100 * 36) / 32) // 112.5
    expect(f('lombardi')(100, 3, 8)).toBeCloseTo(100 * Math.pow(5, 0.1)) // 117.46
    expect(f('oconner')(100, 3, 8)).toBeCloseTo(112.5)
    expect(f('wathan')(100, 3, 8)).toBeCloseTo(10000 / (48.8 + 53.8 * Math.exp(-0.375))) // 116.58
  })
  it('RPE10 の1回：Brzycki と Lombardi は実重量、Epley は約3.3%高い', () => {
    expect(f('brzycki')(200, 1, 10)).toBeCloseTo(200)
    expect(f('lombardi')(200, 1, 10)).toBeCloseTo(200)
    expect(epley(200, 1, 10)).toBeCloseTo(206.67, 2)
  })
  it('組み込みの式はすべて検証を通る', () => {
    for (const x of BUILTIN_FORMULAS) expect(validateFormula(x.expr), x.id).toBeNull()
  })
  it('値が出ない式は理由を返す', () => {
    expect(validateFormula('w / (r - 5)')).toMatch(/値が出ません/)
    expect(validateFormula('w * (rpe - 20)')).toMatch(/値が出ません/)
    expect(validateFormula('w * foo')).toMatch(/foo/)
  })
  it('設定で選んだ式を使う', () => {
    const r = resolveFormula({ ...EXAMPLE_SETTINGS, e1rmFormulaId: 'brzycki' })
    expect(r.formula.name).toBe('Brzycki')
    expect(r.fallbackReason).toBeNull()
    expect(r.fn(100, 3, 8)).toBeCloseTo(112.5)
  })
  it('独自の式を使える', () => {
    const custom = { id: 'c1', name: '自作', expr: 'w * (1 + r / 33)' }
    const r = resolveFormula({ ...EXAMPLE_SETTINGS, customFormulas: [custom], e1rmFormulaId: 'c1' })
    expect(r.fallbackReason).toBeNull()
    expect(r.fn(99, 3, 10)).toBeCloseTo(108)
  })
  it('壊れた式・消えた式は Epley に戻す', () => {
    const broken = { id: 'c1', name: '壊れ', expr: 'w * (' }
    const a = resolveFormula({ ...EXAMPLE_SETTINGS, customFormulas: [broken], e1rmFormulaId: 'c1' })
    expect(a.formula.id).toBe('epley')
    expect(a.fallbackReason).toMatch(/壊れ/)
    const b = resolveFormula({ ...EXAMPLE_SETTINGS, e1rmFormulaId: 'gone' })
    expect(b.fn(100, 3, 8)).toBeCloseTo(epley(100, 3, 8))
    expect(b.fallbackReason).not.toBeNull()
  })
})
