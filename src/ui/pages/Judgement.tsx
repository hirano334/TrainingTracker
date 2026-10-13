import { useMemo, useState } from 'react'
import type { Totals } from '../../domain/e1rm'
import {
  judge,
  type ClassVerdict,
  type DropVerdict,
  type Judgement as J,
  type PaceVerdict,
} from '../../domain/judgement'
import type { Checkpoint } from '../../domain/types'
import { addDays, shortDate, todayISO } from '../../domain/weeks'
import { f1, signed } from '../format'
import type { Data } from '../useData'

type Tone = 'good' | 'warning' | 'serious' | 'critical'

const PACE: Record<PaceVerdict, { label: string; tone: Tone }> = {
  inRange: { label: '射程圏', tone: 'good' },
  borderline: { label: '境界', tone: 'warning' },
  hard: { label: '厳しい', tone: 'critical' },
}
const DROP: Record<DropVerdict, { label: string; short: string; tone: Tone }> = {
  normal: { label: '正常（体重減の分だけ落ちた）', short: '正常', tone: 'good' },
  grey: { label: 'グレー', short: 'グレー', tone: 'warning' },
  large: { label: '減量で重量を失いやすい → 83kg級が有利', short: '落ちやすい', tone: 'serious' },
}
export const CLASS_LABEL: Record<ClassVerdict, string> = {
  either: 'どちらも可。見た目の好みで選ぶ（74級は体脂肪11〜12%を維持、83級は大会時に約17%）',
  recommend83: '83kg級を推奨',
  lean83: '83kg級寄り。どちらも可',
  recommend74: '74kg級を推奨（追加の増量コストがかからない）',
}
const CLASS_SHORT: Record<ClassVerdict, string> = {
  either: 'どちらも可',
  recommend83: '83kg級',
  lean83: '83kg級寄り',
  recommend74: '74kg級',
}

function Badge({ v }: { v: { label: string; tone: Tone } | null }) {
  if (!v) return <span className="badge">未判定</span>
  return (
    <span className="badge" style={{ whiteSpace: 'normal' }}>
      <i className={`dot ${v.tone}`} />
      {v.label}
    </span>
  )
}

const lifts = (t: Totals | null) => (t ? `SQ ${f1(t.SQ)} / BP ${f1(t.BP)} / DL ${f1(t.DL)}` : '—')

export const statusLabel = (j: J) =>
  j.final ? `確定（${shortDate(j.cycle.cutEndDate)}）` : `暫定（${shortDate(j.evalDate)}時点）`

/** 1サイクルぶんの判定の表示。判定画面とレポートで共用 */
export function JudgementCards({ j, data }: { j: J; data: Data }) {
  const s = data.settings
  const c = j.cycle
  // 判定日の前後1週間の測定記録を、実測MAXとして並べる
  const measured: Checkpoint | undefined = data.checkpoints
    .filter((x) => x.date >= addDays(c.cutEndDate, -7) && x.date <= addDays(c.cutEndDate, 7))
    .at(-1)
  const measuredTotal =
    measured && measured.maxSQ !== null && measured.maxBP !== null && measured.maxDL !== null
      ? measured.maxSQ + measured.maxBP + measured.maxDL
      : null

  return (
    <>
      <div className="card">
        <h2>階級の判定</h2>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{j.classVerdict ? CLASS_LABEL[j.classVerdict] : '未判定'}</div>
        {!j.classVerdict && (
          <div className="sub" style={{ marginTop: 6 }}>
            {c.baseTotal === null && <div>・基準トータルが未入力（設定のサイクル）</div>}
            {j.now.total === null && <div>・直近2週に SQ・BP・DL の試合基準のセットが必要</div>}
            {j.weekAvgWeight === null && <div>・直近7日の体重が必要</div>}
            {j.drop === null && j.now.total !== null && <div>・落ち幅は減量期に入ってから計算</div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>判定① 伸びのペース</h2>
          <Badge v={j.pace && PACE[j.pace]} />
        </div>
        <table className="kv" style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <th>基準トータル（{shortDate(c.baseDate)}）</th>
              <td>{f1(c.baseTotal)} kg</td>
            </tr>
            <tr>
              <th>
                トータルe1RM
                <div className="muted">{lifts(j.now)}</div>
              </th>
              <td>{f1(j.now.total)} kg</td>
            </tr>
            <tr>
              <th>週平均体重</th>
              <td>{f1(j.weekAvgWeight)} kg</td>
            </tr>
            <tr>
              <th>補正トータル（{f1(c.baseWeight)}kg換算）</th>
              <td>{f1(j.adjTotal)} kg</td>
            </tr>
            <tr>
              <th>伸び</th>
              <td>
                <b>{signed(j.gain)} kg</b>
              </td>
            </tr>
            <tr>
              <th>
                必要ペース
                <div className="muted">
                  ({s.standard74} − 基準トータル) × {c.requiredPaceFactor}
                </div>
              </th>
              <td>{signed(j.required)} kg</td>
            </tr>
            <tr>
              <th>
                本命大会時点の予測トータル
                <div className="muted">
                  基準 + 伸び × {c.projectionMultiplier}／標準 74kg級 {s.standard74}・83kg級 {s.standard83}
                </div>
              </th>
              <td>{f1(j.projection)} kg</td>
            </tr>
            {measured && (
              <tr>
                <th>
                  実測MAX（{shortDate(measured.date)}）
                  <div className="muted">
                    SQ {measured.maxSQ ?? '—'} / BP {measured.maxBP ?? '—'} / DL {measured.maxDL ?? '—'}
                    {measured.sleepHours !== null && `／睡眠${measured.sleepHours}h`}
                    {measured.fatigue !== null && `／疲労${measured.fatigue}`}
                  </div>
                </th>
                <td>{f1(measuredTotal)} kg</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row between wrap">
          <h2 style={{ margin: 0 }}>判定② 減量による落ち幅</h2>
          <Badge v={j.dropVerdict && DROP[j.dropVerdict]} />
        </div>
        <table className="kv" style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <th>
                トータルe1RM（{shortDate(c.bulkEndDate)}）
                <div className="muted">{lifts(j.atBulkEnd)}</div>
              </th>
              <td>{f1(j.atBulkEnd?.total)} kg</td>
            </tr>
            <tr>
              <th>トータルe1RM（{shortDate(j.evalDate)}）</th>
              <td>{f1(j.now.total)} kg</td>
            </tr>
            <tr>
              <th>
                落ち幅
                <div className="muted">
                  体重補正なし。〜{s.dropNormalMaxKg}kg 正常／〜{s.dropGreyMaxKg}kg グレー
                </div>
              </th>
              <td>
                <b>{f1(j.drop)} kg</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>83kg級ルートの必要ペース</h2>
        {j.route83.length === 0 ? (
          <div className="sub">直近7日の体重が必要です。</div>
        ) : (
          <table className="kv">
            <tbody>
              {j.route83.map((r) => (
                <tr key={r.targetKg}>
                  <th>{r.targetKg}kg に着地</th>
                  <td>{signed(r.perMonth, 2)} kg/月</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="muted" style={{ marginTop: 6 }}>
          (着地目標 − {shortDate(j.evalDate)}時点の週平均体重) ÷ {s.route83Months}ヶ月
        </div>
      </div>
    </>
  )
}

/** サイクル同士の比較 */
function Compare({ all }: { all: J[] }) {
  return (
    <div className="card">
      <h2>サイクルの比較</h2>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>サイクル</th>
              <th>伸び</th>
              <th>必要</th>
              <th>判定①</th>
              <th>落ち幅</th>
              <th>判定②</th>
              <th>階級</th>
            </tr>
          </thead>
          <tbody>
            {all.map((j) => (
              <tr key={j.cycle.id}>
                <td style={{ textAlign: 'left' }}>
                  {j.cycle.name}
                  {!j.final && '（暫定）'}
                </td>
                <td>{signed(j.gain)}</td>
                <td>{signed(j.required)}</td>
                <td>{j.pace ? PACE[j.pace].label : '—'}</td>
                <td>{f1(j.drop)}</td>
                <td>{j.dropVerdict ? DROP[j.dropVerdict].short : '—'}</td>
                <td>{j.classVerdict ? CLASS_SHORT[j.classVerdict] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Judgement({ data, openReport }: { data: Data; openReport: (cycleId: string) => void }) {
  const today = todayISO()
  const all = useMemo(
    () => data.cycles.map((c) => judge(data.settings, c, data.dailyLogs, data.topSets, today)),
    [data, today],
  )
  // 最初は、今日を含むサイクル（無ければ最後に始まったもの）
  const [picked, setPicked] = useState<string | null>(null)
  const current =
    all.find((j) => j.cycle.id === picked) ??
    all.find((j) => j.cycle.baseDate <= today && today <= j.cycle.cutEndDate) ??
    all.filter((j) => j.cycle.baseDate <= today).at(-1) ??
    all[0]

  if (!current) {
    return (
      <>
        <div className="page-head">
          <h1>判定</h1>
        </div>
        <div className="card sub">判定するサイクルがありません。設定の「サイクル」で、基準日・増量終了日・減量終了日を申告してください。</div>
      </>
    )
  }

  const c = current.cycle
  return (
    <>
      <div className="page-head">
        <h1>判定</h1>
        <span className="badge">{statusLabel(current)}</span>
      </div>

      {all.length > 1 && (
        <label className="field" style={{ marginBottom: 12 }}>
          <span>サイクル</span>
          <select value={c.id} onChange={(e) => setPicked(e.target.value)}>
            {all.map((j) => (
              <option key={j.cycle.id} value={j.cycle.id}>
                {j.cycle.name}（{j.cycle.baseDate}〜{j.cycle.cutEndDate}）
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="card sub">
        <b style={{ color: 'var(--text)' }}>{c.name}</b>　基準 {shortDate(c.baseDate)} → 増量終了 {shortDate(c.bulkEndDate)} →
        減量終了 {shortDate(c.cutEndDate)}／{data.formula.formula.name}式
        {!current.final && <div>減量終了日に確定します。それまでは今日までの記録で計算した途中経過です。</div>}
      </div>

      <JudgementCards j={current} data={data} />
      {all.length > 1 && <Compare all={all} />}

      <button type="button" className="btn" style={{ width: '100%' }} onClick={() => openReport(c.id)}>
        レポートを開く（印刷・PDF）
      </button>
    </>
  )
}
