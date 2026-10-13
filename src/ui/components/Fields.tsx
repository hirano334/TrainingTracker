import type { ReactNode } from 'react'

/** 空欄を許す数値入力 */
export function NumField(props: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  step?: string
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={props.step ?? 'any'}
        placeholder={props.placeholder}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}

export function DateField(props: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type="date" value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)} />
    </label>
  )
}

export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

/** 1つ選ぶボタンの並び */
export function Seg<T extends string | number>(props: {
  options: readonly T[]
  value: T | null
  onChange: (v: T) => void
  label: string
  render?: (v: T) => ReactNode
  className?: string
}) {
  return (
    <div className={`seg ${props.className ?? ''}`} role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o} type="button" aria-pressed={props.value === o} onClick={() => props.onChange(o)}>
          {props.render ? props.render(o) : o}
        </button>
      ))}
    </div>
  )
}
