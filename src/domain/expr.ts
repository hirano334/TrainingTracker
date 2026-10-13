// 数式だけを解釈する小さな評価器。JavaScript の eval は使わないので、
// 同期やバックアップで入ってきた式から任意のコードが動くことはない。
//
//   式   := 項 (('+' | '-') 項)*
//   項   := 単項 (('*' | '/') 単項)*
//   単項 := ('-' | '+') 単項 | べき
//   べき := 基本 ('^' 単項)?          右結合。-2^2 は -(2^2)
//   基本 := 数値 | 変数 | 関数 '(' 式 (',' 式)* ')' | '(' 式 ')'

export class ExprError extends Error {}

export type Vars = Record<string, number>
export type Compiled = (vars: Vars) => number

export const MAX_EXPR_LENGTH = 200

/**
 * Tuchscherer（Reactive Training Systems）の RPE 換算表。
 * 実効回数 r（回数 + 残り回数）で扱える重量が、1RM の何割かを返す。
 * 表は r = 1, 1.5, 2, … の値で、あいだは直線でつなぐ。表の外は端の値。
 */
const RTS_TABLE: [number, number][] = [
  [1, 1.0],
  [1.5, 0.978],
  [2, 0.955],
  [2.5, 0.939],
  [3, 0.922],
  [3.5, 0.907],
  [4, 0.892],
  [4.5, 0.878],
  [5, 0.863],
  [5.5, 0.85],
  [6, 0.837],
  [6.5, 0.824],
  [7, 0.811],
  [7.5, 0.799],
  [8, 0.786],
  [8.5, 0.774],
  [9, 0.762],
  [10, 0.739],
  [11, 0.707],
  [12, 0.68],
]

export function rtsFraction(r: number): number {
  if (!(r > RTS_TABLE[0][0])) return RTS_TABLE[0][1]
  for (let i = 1; i < RTS_TABLE.length; i++) {
    const [x1, y1] = RTS_TABLE[i]
    if (r <= x1) {
      const [x0, y0] = RTS_TABLE[i - 1]
      return y0 + ((y1 - y0) * (r - x0)) / (x1 - x0)
    }
  }
  return RTS_TABLE[RTS_TABLE.length - 1][1]
}

/** 名前 → [引数の数（null は1個以上いくつでも）, 実装] */
const FUNCTIONS = new Map<string, [number | null, (...a: number[]) => number]>([
  ['exp', [1, Math.exp]],
  ['ln', [1, Math.log]],
  ['log10', [1, Math.log10]],
  ['sqrt', [1, Math.sqrt]],
  ['abs', [1, Math.abs]],
  ['pow', [2, Math.pow]],
  ['min', [null, Math.min]],
  ['max', [null, Math.max]],
  ['rts', [1, rtsFraction]],
])

export const FUNCTION_NAMES = [...FUNCTIONS.keys()]

type Token = { kind: 'num'; value: number } | { kind: 'id'; name: string } | { kind: 'op'; op: string }

function tokenize(src: string): Token[] {
  // 全角や掛け算記号で打っても通るようにする
  const s = src.normalize('NFKC').replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
  const out: Token[] = []
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^(),]))/y
  let pos = 0
  while (pos < s.length) {
    if (/^\s*$/.test(s.slice(pos))) break
    re.lastIndex = pos
    const m = re.exec(s)
    if (!m) throw new ExprError(`${pos + 1}文字目「${s.slice(pos).trim()[0]}」は使えません`)
    if (m[1] !== undefined) out.push({ kind: 'num', value: Number(m[1]) })
    else if (m[2] !== undefined) out.push({ kind: 'id', name: m[2] })
    else out.push({ kind: 'op', op: m[3] })
    pos = re.lastIndex
  }
  return out
}

/** 式を一度だけ解釈し、変数を渡すと値を返す関数にする。式が不正なら ExprError */
export function compile(src: string, variables: readonly string[]): Compiled {
  if (src.trim() === '') throw new ExprError('式が空です')
  if (src.length > MAX_EXPR_LENGTH) throw new ExprError(`式は${MAX_EXPR_LENGTH}文字までです`)
  const tokens = tokenize(src)
  let i = 0

  const peekOp = (op: string) => {
    const t = tokens[i]
    return t !== undefined && t.kind === 'op' && t.op === op
  }
  const expectOp = (op: string) => {
    if (!peekOp(op)) throw new ExprError(`「${op}」が必要です`)
    i++
  }

  function expr(): Compiled {
    let left = term()
    while (peekOp('+') || peekOp('-')) {
      const minus = peekOp('-')
      i++
      const a = left
      const b = term()
      left = minus ? (v) => a(v) - b(v) : (v) => a(v) + b(v)
    }
    return left
  }

  function term(): Compiled {
    let left = unary()
    while (peekOp('*') || peekOp('/')) {
      const div = peekOp('/')
      i++
      const a = left
      const b = unary()
      left = div ? (v) => a(v) / b(v) : (v) => a(v) * b(v)
    }
    return left
  }

  function unary(): Compiled {
    if (peekOp('-')) {
      i++
      const a = unary()
      return (v) => -a(v)
    }
    if (peekOp('+')) {
      i++
      return unary()
    }
    return power()
  }

  function power(): Compiled {
    const base = primary()
    if (!peekOp('^')) return base
    i++
    const exponent = unary()
    return (v) => Math.pow(base(v), exponent(v))
  }

  function primary(): Compiled {
    const t = tokens[i]
    if (t === undefined) throw new ExprError('式が途中で終わっています')
    i++
    if (t.kind === 'num') {
      const value = t.value
      return () => value
    }
    if (t.kind === 'op') {
      if (t.op !== '(') throw new ExprError(`「${t.op}」の位置が正しくありません`)
      const inner = expr()
      expectOp(')')
      return inner
    }
    const name = t.name
    if (peekOp('(')) {
      const f = FUNCTIONS.get(name)
      if (!f) throw new ExprError(`関数「${name}」は使えません（使える関数：${FUNCTION_NAMES.join(', ')}）`)
      i++
      const args = [expr()]
      while (peekOp(',')) {
        i++
        args.push(expr())
      }
      expectOp(')')
      const [arity, impl] = f
      if (arity !== null && args.length !== arity) {
        throw new ExprError(`${name} の引数は${arity}個です`)
      }
      return (v) => impl(...args.map((a) => a(v)))
    }
    if (!variables.includes(name)) {
      throw new ExprError(`「${name}」は使えません（使える変数：${variables.join(', ')}）`)
    }
    return (v) => v[name]
  }

  const root = expr()
  if (i < tokens.length) {
    const t = tokens[i]
    throw new ExprError(`「${t.kind === 'op' ? t.op : t.kind === 'id' ? t.name : t.value}」の位置が正しくありません`)
  }
  return root
}
