import { TABLES, type AppData, type DailyLog, type TopSet } from '../domain/types'
import { todayISO } from '../domain/weeks'
import { db, readAll, setMeta, writeNewer, type TrackerDB } from './db'

/** バックアップファイルと Drive 上のファイルで共通の形式 */
export interface Payload {
  app: 'cycle-tracker'
  schema: 1
  exportedAt: string
  data: AppData
}

export function toPayload(data: AppData): Payload {
  return { app: 'cycle-tracker', schema: 1, exportedAt: new Date().toISOString(), data }
}

/** 形式を確かめてデータ部分を取り出す。別のファイルなら例外 */
export function parsePayload(text: string): Partial<AppData> {
  const p = JSON.parse(text) as Partial<Payload>
  if (p?.app !== 'cycle-tracker' || typeof p.data !== 'object' || p.data === null) {
    throw new Error('このアプリのバックアップファイルではありません')
  }
  if (p.schema !== 1) throw new Error(`未対応の形式です（schema ${String(p.schema)}）`)
  const out: Partial<AppData> = {}
  for (const t of TABLES) {
    const rows = (p.data as Partial<AppData>)[t]
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`${t} の形式が不正です`)
    if (rows) (out as Record<string, unknown>)[t] = rows
  }
  return out
}

export async function exportJSON(d: TrackerDB = db): Promise<string> {
  return JSON.stringify(toPayload(await readAll(d)))
}

/** バックアップを読み込む。手元より新しいレコードだけを取り込む */
export async function importJSON(text: string, d: TrackerDB = db): Promise<void> {
  await writeNewer(parsePayload(text), d)
}

function csv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // Excel で文字化けしないよう BOM を付ける
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function dailyLogsCSV(logs: DailyLog[]): string {
  return csv(
    ['日付', '体重(kg)', '体脂肪率(%)', '摂取カロリー(kcal)', 'タンパク質(g)'],
    logs
      .filter((l) => !l.deleted)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => [l.date, l.weight, l.bodyFatPct, l.kcal, l.proteinG]),
  )
}

export function topSetsCSV(sets: TopSet[]): string {
  return csv(
    ['日付', '種目', '重量(kg)', '回数', 'RPE', '試合基準', 'メモ'],
    sets
      .filter((s) => !s.deleted)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => [s.date, s.lift, s.weight, s.reps, s.rpe, s.comp ? '○' : '×', s.memo]),
  )
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadBackup(): Promise<void> {
  download(`cycle-tracker-${todayISO()}.json`, await exportJSON(), 'application/json')
  await setMeta('lastBackupAt', Date.now())
}
