import type { AppData, DailyLog, ISODate, Lift, TopSet, WaistLog } from './types'
import { addDays, diffDays } from './weeks'

/** 再現できる乱数（mulberry32） */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const round = (x: number, step: number) => Math.round(x / step) * step

/** 画面確認とテスト用の、2026-11-16〜2027-02-28 のサンプル記録 */
export function sampleData(
  seed = 1,
): Pick<AppData, 'dailyLogs' | 'waistLogs' | 'topSets'> {
  const rand = rng(seed)
  const start: ISODate = '2026-11-16'
  const baseDate: ISODate = '2026-11-30'
  const bulkEnd: ISODate = '2027-01-31'
  const end: ISODate = '2027-02-28'
  const updatedAt = 1

  /** 体重の真値 */
  const trueWeight = (d: ISODate) => {
    if (d <= baseDate) return lerp(73.1, 72.5, diffDays(start, d) / diffDays(start, baseDate))
    if (d <= bulkEnd) return lerp(72.5, 75.6, diffDays(baseDate, d) / diffDays(baseDate, bulkEnd))
    return lerp(75.6, 73.9, diffDays(bulkEnd, d) / diffDays(bulkEnd, end))
  }
  /** 種目別の実力（e1RM）。増量で伸び、減量で少し落ちる */
  const strength = (lift: Lift, d: ISODate) => {
    const base = { SQ: 165, BP: 110, DL: 195 }[lift]
    if (d <= baseDate) return base
    if (d <= bulkEnd) return base * lerp(1, 1.06, diffDays(baseDate, d) / diffDays(baseDate, bulkEnd))
    return base * lerp(1.06, 1.045, diffDays(bulkEnd, d) / diffDays(bulkEnd, end))
  }

  const dailyLogs: DailyLog[] = []
  const waistLogs: WaistLog[] = []
  const topSets: TopSet[] = []
  // 月=SQ, 水=BP, 金=DL, 土=BP
  const plan: Record<number, Lift> = { 0: 'SQ', 2: 'BP', 4: 'DL', 5: 'BP' }

  for (let d = start, i = 0; d <= end; d = addDays(d, 1), i++) {
    const w = trueWeight(d)
    dailyLogs.push({
      date: d,
      updatedAt,
      weight: round(w + (rand() - 0.5) * 0.6, 0.1),
      bodyFatPct: round(13 + (w - 72.5) * 0.6 + (rand() - 0.5) * 1.5, 0.1),
      kcal: i % 3 === 0 ? null : round(2700 + (rand() - 0.5) * 400, 10),
      proteinG: i % 3 === 0 ? null : round(150 + (rand() - 0.5) * 30, 1),
    })

    const dow = i % 7 // 開始日が月曜
    if (dow === 6) {
      waistLogs.push({ date: d, updatedAt, waistCm: round(76 + (w - 72.5) * 0.9 + (rand() - 0.5), 0.5) })
    }
    const lift = plan[dow]
    if (lift) {
      const reps = 1 + Math.floor(rand() * 4)
      const rpe = 7 + Math.floor(rand() * 5) * 0.5
      const target = strength(lift, d) * (1 + (rand() - 0.5) * 0.02)
      topSets.push({
        id: `sample-${d}-${lift}`,
        updatedAt,
        date: d,
        lift,
        weight: round(target / (1 + (reps + (10 - rpe)) / 30), 2.5),
        reps,
        rpe,
        comp: rand() > 0.1,
        memo: '',
      })
    }
  }
  return { dailyLogs, waistLogs, topSets }
}
