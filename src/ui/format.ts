export const f1 = (x: number | null | undefined): string => (x == null ? '—' : x.toFixed(1))

export const f0 = (x: number | null | undefined): string => (x == null ? '—' : String(Math.round(x)))

/** 符号つき（+1.5 / −0.3） */
export const signed = (x: number | null | undefined, digits = 1): string => {
  if (x == null) return '—'
  const s = Math.abs(x).toFixed(digits)
  return x < 0 && Number(s) !== 0 ? `−${s}` : `+${s}`
}

export const ago = (ms: number | null | undefined, now = Date.now()): string => {
  if (!ms) return '未実施'
  const min = Math.floor((now - ms) / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  if (min < 60 * 24) return `${Math.floor(min / 60)}時間前`
  return `${Math.floor(min / (60 * 24))}日前`
}
