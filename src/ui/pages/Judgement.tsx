import { useMemo } from 'react'
import type { Totals } from '../../domain/e1rm'
import { judge, type ClassVerdict, type DropVerdict, type PaceVerdict } from '../../domain/judgement'
import { findCycles } from '../../domain/phases'
import { addDays, shortDate, todayISO } from '../../domain/weeks'
import { f1, signed } from '../format'
import type { Data } from '../useData'

type Tone = 'good' | 'warning' | 'serious' | 'critical'

const PACE: Record<PaceVerdict, { label: string; tone: Tone }> = {
  inRange: { label: '射程圏', tone: 'good' },
  borderline: { label: '境界', tone: 'warning' },
  hard: { label: '厳しい', tone: 'critical' },
}
const DROP: Record<DropVerdict, { label: string; tone: Tone }> = {
  normal: { label: '正常（体重減の分だけ落ちた）', tone: 'good' },
  grey: { label: 'グレー', tone: 'warning' },
  large: { label: '減量で重量を失いやすい → 83kg級が有利', tone: 'serious' },
}
const CLASS: Record<ClassVerdict, string> = {
  either: 'どちらも可。見た目の好みで選ぶ（74級は体脂肪11〜12%を維持、83級は大会時に約17%）',
  recommend83: '83kg級を推奨',
  lean83: '83kg級寄り。どちらも可',
  recommend74: '74kg級を推奨（追加の増量コストがかからない）',
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

const lifts = (t: Totals | null) =>
  t ? `SQ ${f1(t.SQ)} / BP ${f1(t.BP)} / DL ${f1(t.DL)}` : '—'

export function Judgement({ data }: { data: Data }) {
  const today = todayISO()
  const s = data.settings
  const cycle = useMemo(() => findCycles(data.phases, s.baseDate)[0] ?? null, [data.phases, s.baseDate])
  const j = useMemo(
    () => (cycle ? judge(s, cycle, data.dailyLogs, data.topSets, today) : null),
    [s, cycle, data.dailyLogs, data.topSets, today],
  )

  if (!cycle || !j) {
    return (
      <>
        <div className="page-head">
          <h1>判定</h1>
        </div>
        <div className="card sub">基準日より後に「増量 → 減量」のフェーズがありません。設定のフェーズ表を確認してください。</div>
      </>
    )
  }

  // 判定日の前後1週間の測定記録を、実測MAXとして並べる
  const measured = data.checkpoints
    .filter((c) => c.date >= addDays(j.cutEndDate, -7) && c.date <= addDays(j.cutEndDate, 7))
    .at(-1)
  const measuredTotal =
    measured && measured.maxSQ !== null && measured.maxBP !== null && measured.maxDL !== null
      ? measured.maxSQ + measured.maxBP + measured.maxDL
      : null

  return (
    <>
      <div className="page-head">
        <h1>判定</h1>
        <span className="badge">{j.final ? `確定（${shortDate(j.cutEndDate)}）` : `暫定（${shortDate(j.evalDate)}時点）`}</span>
      </div>

      {!j.final && (
        <div className="card sub">
          判定は {cycle.cut.name} の終了日（{j.cutEndDate}）に確定します。それまでは今日までの記録で計算した途中経過です。
        </div>
      )}

      <div className="card">
        <h2>階級の判定</h2>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {j.classVerdict ? CLASS[j.classVerdict] : '未判定'}
        </div>
        {!j.classVerdict && (
          <div className="sub" style={{ marginTop: 6 }}>
            {j.baseTotal === null && '・基準トータルが未入力（設定）'}
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
              <th>基準トータル（{shortDate(s.baseDate)}）</th>
              <td>{f1(j.baseTotal)} kg</td>
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
              <th>補正トータル（{f1(s.baseWeight)}kg換算）</th>
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
                  ({s.standard74} − 基準トータル) × {s.requiredPaceFactor}
                </div>
              </th>
              <td>{signed(j.required)} kg</td>
            </tr>
            <tr>
              <th>
                10月時点の予測トータル
                <div className="muted">
                  基準 + 伸び × {s.projectionMultiplier}／標準 74kg級 {s.standard74}・83kg級 {s.standard83}
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
                トータルe1RM（{shortDate(j.bulkEndDate)}）
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
