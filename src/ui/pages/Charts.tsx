import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { weeklySeries, type WeekRow } from '../../domain/series'
import { addDays, shortDate, todayISO, weekStart } from '../../domain/weeks'
import { Seg } from '../components/Fields'
import { f1 } from '../format'
import type { Data } from '../useData'

type NumKey = { [K in keyof WeekRow]: WeekRow[K] extends number | null ? K : never }[keyof WeekRow]

interface Series {
  key: NumKey
  name: string
  color: string
  /** 目標ラインなど、記録ではない線 */
  reference?: boolean
  /** 点だけ薄く打つ（参考値） */
  faint?: boolean
}

interface Mark {
  week: string
  label: string
}

const RANGES = ['直近12週', '全期間'] as const

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          {s.faint ? (
            <i className="dot" style={{ background: s.color, opacity: 0.4, width: 8, height: 8 }} />
          ) : (
            <i className="key" style={{ borderColor: s.color }} />
          )}
          {s.name}
        </span>
      ))}
    </div>
  )
}

function Tip(props: { active?: boolean; label?: string | number; rows: WeekRow[]; series: Series[]; unit: string }) {
  const row = props.rows.find((r) => r.weekStart === props.label)
  if (!props.active || !row) return null
  const shown = props.series.filter((s) => row[s.key] !== null)
  if (shown.length === 0) return null
  return (
    <div className="chart-tip">
      <div className="t">
        {shortDate(row.weekStart)}〜{shortDate(addDays(row.weekStart, 6))}
      </div>
      {shown.map((s) => (
        <div className="r" key={s.key}>
          <i className="dot" style={{ background: s.color, opacity: s.faint ? 0.4 : 1 }} />
          {s.name}
          <b>
            {f1(row[s.key])}
            {props.unit}
          </b>
        </div>
      ))}
    </div>
  )
}

/** 切りのいい目盛り。データの上下に少し余白ができるように端を丸める */
function niceTicks(values: number[], count = 4): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const raw = Math.max(max - min, 1e-9) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) as number
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) out.push(Number(t.toFixed(6)))
  return out.length > 1 ? out : [lo - step, lo, lo + step]
}

function WeekChart(props: { rows: WeekRow[]; series: Series[]; marks?: Mark[]; unit: string; height?: number }) {
  const { rows, series } = props
  const hasData = rows.some((r) => series.some((s) => !s.reference && r[s.key] !== null))
  if (!hasData) return <div className="muted">まだ記録がありません</div>
  const ticks = niceTicks(
    rows.flatMap((r) => series.map((s) => r[s.key])).filter((x): x is number => x !== null),
  )
  return (
    <>
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={props.height ?? 220}>
        <LineChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={shortDate}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            minTickGap={24}
          />
          <YAxis
            width={40}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          {props.marks?.map((m) => (
            <ReferenceLine
              key={m.week + m.label}
              x={m.week}
              stroke="var(--axis)"
              label={{ value: m.label, position: 'top', fill: 'var(--text-2)', fontSize: 11 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={({ active, label }) => (
              <Tip active={active} label={label} rows={rows} series={series} unit={props.unit} />
            )}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.faint ? 0 : s.reference ? 1.5 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
              isAnimationActive={false}
              dot={
                s.reference
                  ? false
                  : { r: s.faint ? 3 : 4, fill: s.color, fillOpacity: s.faint ? 0.4 : 1, stroke: 'var(--surface)', strokeWidth: 2 }
              }
              activeDot={s.reference ? false : { r: 5, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

function DataTable({ rows, series }: { rows: WeekRow[]; series: Series[] }) {
  const shown = rows.filter((r) => series.some((s) => r[s.key] !== null))
  return (
    <details>
      <summary>表で見る</summary>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>週</th>
              {series.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.weekStart}>
                <td style={{ textAlign: 'left' }}>{shortDate(r.weekStart)}〜</td>
                {series.map((s) => (
                  <td key={s.key}>{f1(r[s.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const C1 = 'var(--series-1)'
const C2 = 'var(--series-2)'
const C3 = 'var(--series-3)'

const WEIGHT: Series[] = [
  { key: 'avgWeight', name: '週平均体重', color: C1 },
  { key: 'targetWeight', name: '目標体重', color: 'var(--muted)', reference: true },
]
const TOTAL: Series[] = [
  { key: 'total', name: 'トータル（そのまま）', color: C1 },
  { key: 'adjTotal', name: 'トータル（体重補正後）', color: C2 },
]
const LIFT_SERIES: Series[] = [
  { key: 'SQ', name: 'SQ', color: C1 },
  { key: 'BP', name: 'BP', color: C2 },
  { key: 'DL', name: 'DL', color: C3 },
]
const LIFT_TABLE: Series[] = [
  ...LIFT_SERIES,
  { key: 'SQx', name: 'SQ（基準×）', color: C1, faint: true },
  { key: 'BPx', name: 'BP（基準×）', color: C2, faint: true },
  { key: 'DLx', name: 'DL（基準×）', color: C3, faint: true },
]
const WAIST: Series[] = [{ key: 'waist', name: 'ウエスト', color: C1 }]
const WEIGHT_ONLY: Series[] = [WEIGHT[0]]

export function Charts({ data }: { data: Data }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('直近12週')
  const today = todayISO()

  const { rows, marks } = useMemo(() => {
    const dates = [
      ...data.dailyLogs.map((l) => l.date),
      ...data.topSets.map((s) => s.date),
      ...data.waistLogs.map((l) => l.date),
    ].sort()
    const last = dates.at(-1) && (dates.at(-1) as string) > today ? (dates.at(-1) as string) : today
    const first = dates[0] ?? today
    const from = range === '全期間' ? first : addDays(weekStart(last), -7 * 11)
    const rows = weeklySeries(
      data.settings,
      data.phases,
      data.dailyLogs,
      data.topSets,
      data.waistLogs,
      from < first ? first : from,
      last,
    )
    // フェーズ境界：各フェーズの開始週
    const weeks = new Set(rows.map((r) => r.weekStart))
    const marks: Mark[] = data.phases
      .filter((p) => p.kind !== 'checkpoint' && p.startDate !== null)
      .map((p) => ({ week: weekStart(p.startDate as string), label: p.name }))
      .filter((m) => weeks.has(m.week))
    return { rows, marks }
  }, [data, range, today])

  return (
    <>
      <div className="page-head">
        <h1>グラフ</h1>
      </div>
      <Seg options={RANGES} value={range} onChange={setRange} label="表示する期間" className="top" />

      <div className="card">
        <h2>週平均体重と目標体重（kg）</h2>
        <WeekChart rows={rows} series={WEIGHT} marks={marks} unit="kg" />
        <DataTable rows={rows} series={WEIGHT} />
      </div>

      <div className="card">
        <h2>トータルe1RM（kg）</h2>
        <WeekChart rows={rows} series={TOTAL} marks={marks} unit="kg" />
        <div className="muted">記録のない種目は直前2週以内の値を引き継いで合計。試合基準×のセットは含まない。</div>
        <DataTable rows={rows} series={TOTAL} />
      </div>

      <div className="card">
        <h2>種目別e1RM（kg）</h2>
        <WeekChart rows={rows} series={LIFT_SERIES} marks={marks} unit="kg" height={260} />
        <div className="muted">その週の最大値。試合基準×のセットは下の表にだけ出す。</div>
        <DataTable rows={rows} series={LIFT_TABLE} />
      </div>

      <div className="card">
        <h2>ウエスト周径（cm）</h2>
        <WeekChart rows={rows} series={WAIST} marks={marks} unit="cm" height={170} />
        <h2 style={{ marginTop: 14 }}>週平均体重（kg）</h2>
        <WeekChart rows={rows} series={WEIGHT_ONLY} marks={marks} unit="kg" height={170} />
        <div className="muted">体重が増えてもウエストが増えていなければ、脂肪より除脂肪が増えている目安。</div>
        <DataTable rows={rows} series={[WAIST[0], WEIGHT[0]]} />
      </div>
    </>
  )
}
