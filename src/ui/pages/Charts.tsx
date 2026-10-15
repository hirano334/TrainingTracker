import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dataRange } from '../../domain/report'
import { dailySeries, weeklySeries, type DayRow, type WeekRow } from '../../domain/series'
import type { ISODate } from '../../domain/types'
import { addDays, shortDate, todayISO, weekStart } from '../../domain/weeks'
import { Seg } from '../components/Fields'
import { f1 } from '../format'
import type { Data } from '../useData'

interface Series<T> {
  key: keyof T & string
  name: string
  color: string
  /** 目標ラインなど、記録ではない線 */
  reference?: boolean
  /** 線を引かず、点だけ薄く打つ */
  faint?: boolean
  /** 点を打たず、線だけ引く（点が多いとき） */
  lineOnly?: boolean
}

interface Mark {
  x: string
  label: string
}

interface ChartProps<T> {
  rows: T[]
  xKey: keyof T & string
  series: Series<T>[]
  marks?: Mark[]
  unit: string
  height?: number
  /** ツールチップの見出し */
  title: (row: T) => string
}

const RANGES = ['直近12週', '全期間'] as const

const val = <T,>(row: T, key: keyof T): number | null => row[key] as number | null

function Legend<T>({ series }: { series: Series<T>[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          {s.faint ? (
            <i className="dot" style={{ background: s.color, opacity: 0.45, width: 8, height: 8 }} />
          ) : (
            <i className="key" style={{ borderColor: s.color }} />
          )}
          {s.name}
        </span>
      ))}
    </div>
  )
}

function Tip<T>(props: ChartProps<T> & { active?: boolean; label?: string | number }) {
  const row = props.rows.find((r) => r[props.xKey] === props.label)
  if (!props.active || !row) return null
  const shown = props.series.filter((s) => val(row, s.key) !== null)
  if (shown.length === 0) return null
  return (
    <div className="chart-tip">
      <div className="t">{props.title(row)}</div>
      {shown.map((s) => (
        <div className="r" key={s.key}>
          <i className="dot" style={{ background: s.color, opacity: s.faint ? 0.45 : 1 }} />
          {s.name}
          <b>
            {f1(val(row, s.key))}
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

function Chart<T>(props: ChartProps<T>) {
  const { rows, series, xKey } = props
  const hasData = rows.some((r) => series.some((s) => !s.reference && val(r, s.key) !== null))
  if (!hasData) return <div className="muted">まだ記録がありません</div>
  const ticks = niceTicks(
    rows.flatMap((r) => series.map((s) => val(r, s.key))).filter((x): x is number => x !== null),
  )
  return (
    <>
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={props.height ?? 220}>
        <LineChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey={xKey as never}
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
              key={m.x + m.label}
              x={m.x}
              stroke="var(--axis)"
              label={{ value: m.label, position: 'top', fill: 'var(--text-2)', fontSize: 11 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={({ active, label }) => <Tip {...props} active={active} label={label} />}
          />
          {series.map((s) => {
            const line = !s.faint
            const dots = !s.reference && !s.lineOnly
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={line ? (s.reference ? 1.5 : 2) : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
                connectNulls
                isAnimationActive={false}
                dot={
                  dots
                    ? s.faint
                      ? { r: 2.5, fill: s.color, fillOpacity: 0.45, stroke: 'none' }
                      : { r: 4, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }
                    : false
                }
                activeDot={
                  s.reference ? false : { r: 5, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }
                }
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

function DataTable<T>({ rows, series, xKey, xLabel }: Pick<ChartProps<T>, 'rows' | 'series' | 'xKey'> & { xLabel: string }) {
  const shown = rows.filter((r) => series.some((s) => !s.reference && val(r, s.key) !== null))
  return (
    <details className="no-print">
      <summary>表で見る</summary>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{xLabel}</th>
              {series.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r[xKey] as string}>
                <td style={{ textAlign: 'left' }}>{shortDate(r[xKey] as string)}</td>
                {series.map((s) => (
                  <td key={s.key}>{f1(val(r, s.key))}</td>
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
const REF = 'var(--muted)'

const DAILY: Series<DayRow>[] = [
  { key: 'weight', name: '日々の体重', color: C1, faint: true },
  { key: 'trend', name: '7日移動平均', color: C1, lineOnly: true },
  { key: 'target', name: '目標体重', color: REF, reference: true },
]
const HEART: Series<DayRow>[] = [
  { key: 'sleepHr', name: '睡眠時心拍数', color: C1, faint: true },
  { key: 'hrTrend', name: '7日移動平均', color: C1, lineOnly: true },
]
const WEIGHT: Series<WeekRow>[] = [
  { key: 'avgWeight', name: '週平均体重', color: C1 },
  { key: 'targetWeight', name: '目標体重', color: REF, reference: true },
]
const TOTAL: Series<WeekRow>[] = [
  { key: 'total', name: 'トータル（そのまま）', color: C1 },
  { key: 'adjTotal', name: 'トータル（体重補正後）', color: C2 },
]
const LIFT_SERIES: Series<WeekRow>[] = [
  { key: 'SQ', name: 'SQ', color: C1 },
  { key: 'BP', name: 'BP', color: C2 },
  { key: 'DL', name: 'DL', color: C3 },
]
const LIFT_TABLE: Series<WeekRow>[] = [
  ...LIFT_SERIES,
  { key: 'SQx', name: 'SQ（基準×）', color: C1, faint: true },
  { key: 'BPx', name: 'BP（基準×）', color: C2, faint: true },
  { key: 'DLx', name: 'DL（基準×）', color: C3, faint: true },
]
const WAIST: Series<WeekRow>[] = [{ key: 'waist', name: 'ウエスト', color: C1 }]
const WEIGHT_ONLY: Series<WeekRow>[] = [WEIGHT[0]]

const weekTitle = (r: WeekRow) => `${shortDate(r.weekStart)}〜${shortDate(addDays(r.weekStart, 6))}`
const dayTitle = (r: DayRow) => shortDate(r.date)

/** グラフ一式。from〜to の期間を描く。グラフ画面と判定レポートで共用 */
export function ChartSet({ data, from, to, compact }: { data: Data; from: ISODate; to: ISODate; compact?: boolean }) {
  // レポートでは紙に収まるよう低めに描く
  const h = (normal: number) => (compact ? Math.round(normal * 0.78) : normal)
  const { weeks, days, weekMarks, dayMarks } = useMemo(() => {
    const weeks = weeklySeries(
      data.settings,
      data.refWeight,
      data.phases,
      data.dailyLogs,
      data.topSets,
      data.waistLogs,
      from,
      to,
    )
    const days = dailySeries(data.phases, data.dailyLogs, from, to)
    // フェーズ境界：各フェーズの開始日（週次のグラフではその週）
    const starts = data.phases
      .filter((p) => p.kind !== 'checkpoint' && p.startDate !== null)
      .map((p) => ({ date: p.startDate as string, label: p.name }))
    const inWeeks = new Set(weeks.map((r) => r.weekStart))
    return {
      weeks,
      days,
      weekMarks: starts.map((m) => ({ x: weekStart(m.date), label: m.label })).filter((m) => inWeeks.has(m.x)),
      dayMarks: starts.filter((m) => m.date >= from && m.date <= to).map((m) => ({ x: m.date, label: m.label })),
    }
  }, [data, from, to])

  const week = { rows: weeks, xKey: 'weekStart' as const, marks: weekMarks, title: weekTitle }
  return (
    <>
      <div className="card">
        <h2>日々の体重とトレンド（kg）</h2>
        <Chart rows={days} xKey="date" series={DAILY} marks={dayMarks} unit="kg" title={dayTitle} height={h(220)} />
        <div className="muted">線はその日までの7日間の平均（記録が4日以上ある日のみ）。</div>
        <DataTable rows={days} xKey="date" series={DAILY} xLabel="日付" />
      </div>

      <div className="card">
        <h2>週平均体重と目標体重（kg）</h2>
        <Chart {...week} series={WEIGHT} unit="kg" height={h(220)} />
        <DataTable {...week} series={WEIGHT} xLabel="週" />
      </div>

      <div className="card">
        <h2>推定トータル（kg）</h2>
        <Chart {...week} series={TOTAL} unit="kg" height={h(220)} />
        <div className="muted">
          {data.formula.formula.name}。記録のない種目は直前2週以内の値を引き継いで合計。試合基準×のセットは含まない。
          補正後は{f1(data.refWeight)}kg換算。
        </div>
        <DataTable {...week} series={TOTAL} xLabel="週" />
      </div>

      <div className="card">
        <h2>種目別の推定1RM（kg）</h2>
        <Chart {...week} series={LIFT_SERIES} unit="kg" height={h(260)} />
        <div className="muted">その週の最大値。試合基準×のセットは表にだけ出す。</div>
        <DataTable {...week} series={LIFT_TABLE} xLabel="週" />
      </div>

      {data.settings.show.heartRate && (
        <div className="card">
          <h2>睡眠時平均心拍数（bpm）</h2>
          <Chart rows={days} xKey="date" series={HEART} marks={dayMarks} unit="bpm" title={dayTitle} height={h(190)} />
          <div className="muted">疲労・体調・飲酒などで上下する。トータルや体重の動きと見比べる材料として。</div>
          <DataTable rows={days} xKey="date" series={HEART} xLabel="日付" />
        </div>
      )}

      {data.settings.show.waist && (
      <div className="card">
        <h2>ウエスト周径（cm）</h2>
        <Chart {...week} series={WAIST} unit="cm" height={h(170)} />
        <h2 style={{ marginTop: 14 }}>週平均体重（kg）</h2>
        <Chart {...week} series={WEIGHT_ONLY} unit="kg" height={h(170)} />
        <div className="muted">体重が増えてもウエストが増えていなければ、脂肪より除脂肪が増えている目安。</div>
        <DataTable {...week} series={[WAIST[0], WEIGHT[0]]} xLabel="週" />
      </div>
      )}
    </>
  )
}

export function Charts({ data }: { data: Data }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('直近12週')
  const today = todayISO()
  const { from, to } = useMemo(() => {
    const all = dataRange(data, today)
    const recent = addDays(weekStart(all.to), -7 * 11)
    return { from: range === '全期間' || recent < all.from ? all.from : recent, to: all.to }
  }, [data, range, today])

  return (
    <>
      <div className="page-head">
        <h1>グラフ</h1>
      </div>
      <Seg options={RANGES} value={range} onChange={setRange} label="表示する期間" className="top" />
      <ChartSet data={data} from={from} to={to} />
    </>
  )
}
