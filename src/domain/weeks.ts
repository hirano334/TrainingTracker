import type { ISODate } from './types'

const DAY_MS = 86_400_000

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS)
}

/** b − a の日数 */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS)
}

/** その日を含む週の月曜日（週は月曜始まり〜日曜終わり） */
export function weekStart(d: ISODate): ISODate {
  const dow = new Date(toUTC(d)).getUTCDay() // 0=日
  return addDays(d, -((dow + 6) % 7))
}

/** 端末のローカル日付 */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** from 以上 to 以下の週の月曜日を並べる */
export function weekStartsBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

/** "12/1" 形式 */
export function shortDate(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number)
  return `${m}/${day}`
}
