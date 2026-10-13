import type { DailyLog, ISODate, Lift, TopSet } from '../domain/types'
import { db, putMany, type TrackerDB } from './db'

/** 引用符・BOM・改行コード（CRLF / LF）に対応した CSV の読み取り。空行は飛ばす */
export function parseCSV(text: string): { line: number; cells: string[] }[] {
  const s = text.replace(/^﻿/, '')
  const out: { line: number; cells: string[] }[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let startLine = 1
  const endRow = () => {
    cells.push(cell)
    if (cells.some((c) => c.trim() !== '')) out.push({ line: startLine, cells })
    cells = []
    cell = ''
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else {
        if (c === '\n') line++
        cell += c
      }
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ',') {
      cells.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      endRow()
      line++
      startLine = line
    } else cell += c
  }
  if (cell !== '' || cells.length > 0) endRow()
  return out
}

type Row<T> = Omit<T, 'updatedAt' | 'deleted'>

export interface RowError {
  line: number
  reason: string
}

export type ParsedImport =
  | { kind: 'dailyLogs'; rows: Row<DailyLog>[]; errors: RowError[] }
  | { kind: 'topSets'; rows: Row<TopSet>[]; errors: RowError[] }

/** 見出しの別名。単位の括弧と空白は外し、小文字にしてから比べる */
const COLUMNS = {
  date: ['date', '日付'],
  lift: ['lift', 'exercise', '種目'],
  weight: ['weight', '体重', '重量'],
  bodyFatPct: ['bodyfat', 'bf', 'fat', '体脂肪率', '体脂肪'],
  kcal: ['kcal', 'calories', 'カロリー', '摂取カロリー'],
  proteinG: ['protein', 'タンパク質', 'たんぱく質'],
  sleepHr: ['sleephr', 'hr', 'heartrate', '睡眠時心拍数', '心拍数'],
  reps: ['reps', '回数'],
  rpe: ['rpe'],
  comp: ['comp', '試合基準'],
  memo: ['memo', 'note', 'notes', 'メモ'],
} as const
type Column = keyof typeof COLUMNS

const LIFT_ALIASES: Record<string, Lift> = {
  sq: 'SQ',
  squat: 'SQ',
  スクワット: 'SQ',
  bp: 'BP',
  bench: 'BP',
  benchpress: 'BP',
  ベンチ: 'BP',
  ベンチプレス: 'BP',
  dl: 'DL',
  deadlift: 'DL',
  デッド: 'DL',
  デッドリフト: 'DL',
}

const norm = (h: string) =>
  h
    .normalize('NFKC')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

function parseDate(v: string): ISODate | null {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 空欄は null、数値でなければ NaN */
function num(v: string | undefined): number | null {
  const t = (v ?? '').normalize('NFKC').trim()
  return t === '' ? null : Number(t)
}

function parseComp(v: string | undefined): boolean | null {
  const t = (v ?? '').normalize('NFKC').trim().toLowerCase()
  if (['', '○', '〇', 'o', '1', 'true', 'yes', 'y'].includes(t)) return true
  if (['×', 'x', '0', 'false', 'no', 'n'].includes(t)) return false
  return null
}

/** CSV を読んで、体重の記録かトップセットの記録かを見出しから判別する。判別できなければ例外 */
export function parseImport(text: string): ParsedImport {
  const table = parseCSV(text)
  if (table.length === 0) throw new Error('ファイルが空です')
  const header = table[0].cells.map(norm)
  const col = {} as Partial<Record<Column, number>>
  for (const key of Object.keys(COLUMNS) as Column[]) {
    const i = header.findIndex((h) => (COLUMNS[key] as readonly string[]).includes(h))
    if (i >= 0) col[key] = i
  }
  if (col.date === undefined || col.weight === undefined) {
    throw new Error('見出し行に「日付」と「体重」または「重量」の列が必要です')
  }
  const get = (cells: string[], key: Column) => (col[key] === undefined ? undefined : cells[col[key]])
  const body = table.slice(1)
  const errors: RowError[] = []

  if (col.lift !== undefined) {
    if (col.reps === undefined || col.rpe === undefined) {
      throw new Error('トップセットの取り込みには「回数」と「RPE」の列が必要です')
    }
    const rows: Row<TopSet>[] = []
    for (const { line, cells } of body) {
      const date = parseDate(get(cells, 'date') ?? '')
      const lift = LIFT_ALIASES[norm(get(cells, 'lift') ?? '')]
      const weight = num(get(cells, 'weight'))
      const reps = num(get(cells, 'reps'))
      const rpe = num(get(cells, 'rpe'))
      const comp = parseComp(get(cells, 'comp'))
      const reason =
        date === null
          ? '日付が読めません'
          : lift === undefined
            ? '種目は SQ / BP / DL のいずれか'
            : weight === null || !(weight > 0)
              ? '重量が読めません'
              : reps === null || !Number.isInteger(reps) || reps < 1 || reps > 5
                ? '回数は1〜5'
                : rpe === null || !(rpe >= 6 && rpe <= 10) || !Number.isInteger(rpe * 2)
                  ? 'RPE は6〜10の0.5刻み'
                  : comp === null
                    ? '試合基準は ○ か ×'
                    : null
      if (reason) {
        errors.push({ line, reason })
        continue
      }
      rows.push({
        // 内容から ID を作るので、同じファイルを何度読み込んでも増えない
        id: `csv-${date}-${lift}-${weight}-${reps}-${rpe}`,
        date: date as ISODate,
        lift: lift as Lift,
        weight: weight as number,
        reps: reps as number,
        rpe: rpe as number,
        comp: comp as boolean,
        memo: (get(cells, 'memo') ?? '').trim(),
      })
    }
    return { kind: 'topSets', rows, errors }
  }

  const rows: Row<DailyLog>[] = []
  for (const { line, cells } of body) {
    const date = parseDate(get(cells, 'date') ?? '')
    const weight = num(get(cells, 'weight'))
    const optional = [
      num(get(cells, 'bodyFatPct')),
      num(get(cells, 'kcal')),
      num(get(cells, 'proteinG')),
      num(get(cells, 'sleepHr')),
    ]
    const reason =
      date === null
        ? '日付が読めません'
        : weight === null || !(weight > 0)
          ? '体重が読めません'
          : optional.some((x) => x !== null && !(x >= 0))
            ? '体脂肪率・カロリー・タンパク質・心拍数に数値でない値があります'
            : null
    if (reason) {
      errors.push({ line, reason })
      continue
    }
    rows.push({
      date: date as ISODate,
      weight: weight as number,
      bodyFatPct: optional[0],
      kcal: optional[1],
      proteinG: optional[2],
      // 心拍数の列が無いファイルでは項目ごと持たない（元の記録と同じ形にする）
      ...(optional[3] !== null ? { sleepHr: optional[3] } : {}),
    })
  }
  return { kind: 'dailyLogs', rows, errors }
}

export interface ImportOutcome {
  added: number
  /** 既に記録があったので取り込まなかった件数 */
  skipped: number
}

/** 取り込む。既に記録のある日（セットは同じ内容のもの）は、overwrite でなければ触らない */
export async function applyImport(
  parsed: ParsedImport,
  overwrite = false,
  d: TrackerDB = db,
): Promise<ImportOutcome> {
  const existing =
    parsed.kind === 'dailyLogs'
      ? new Set((await d.dailyLogs.toArray()).filter((r) => !r.deleted).map((r) => r.date))
      : new Set((await d.topSets.toArray()).filter((r) => !r.deleted).map((r) => r.id))
  // ファイルの中で同じ日・同じセットが重なっていたら後の行を使う
  const byKey = new Map<string, Row<DailyLog> | Row<TopSet>>()
  for (const r of parsed.rows) byKey.set('id' in r ? r.id : r.date, r)
  const take = [...byKey].filter(([k]) => overwrite || !existing.has(k)).map(([, r]) => r)
  if (parsed.kind === 'dailyLogs') await putMany('dailyLogs', take as Row<DailyLog>[], d)
  else await putMany('topSets', take as Row<TopSet>[], d)
  return { added: take.length, skipped: byKey.size - take.length }
}
