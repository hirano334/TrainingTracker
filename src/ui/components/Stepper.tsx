import { useEffect, useState } from 'react'

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  step: number
  /** 小数点以下の桁数 */
  digits?: number
  label: string
}

/** −／＋ボタンつきの数値入力。値を直接打つこともできる */
export function Stepper({ value, onChange, step, digits = 1, label }: Props) {
  const show = (v: number | null) => (v === null ? '' : v.toFixed(digits))
  const [text, setText] = useState(show(value))
  useEffect(() => {
    // 打っている途中（"72." など）は書き換えない
    if (text === '' ? value !== null : Number(text) !== value) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, Math.round(((value ?? 0) + dir * step) / step) * step)
    setText(next.toFixed(digits))
    onChange(Number(next.toFixed(digits)))
  }

  return (
    <div className="stepper">
      <button type="button" onClick={() => bump(-1)} aria-label={`${label}を${step}減らす`}>
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.')
          setText(t)
          const n = Number(t)
          onChange(t.trim() === '' || !Number.isFinite(n) ? null : n)
        }}
      />
      <button type="button" onClick={() => bump(1)} aria-label={`${label}を${step}増やす`}>
        ＋
      </button>
    </div>
  )
}
