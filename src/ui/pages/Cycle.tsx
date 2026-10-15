import { useEffect, useMemo, useState } from 'react'
import { put } from '../../db/db'
import type { ResolvedCycle } from '../../domain/cycles'
import { judge, type Judgement as J } from '../../domain/judgement'
import { phasePace } from '../../domain/phasePlan'
import { summarizeCycle, type CycleSummary, type PhaseSummary } from '../../domain/summary'
import { LIFTS, type Cycle as CycleT, type Settings } from '../../domain/types'
import { shortDate, todayISO } from '../../domain/weeks'
import { f0, f1, signed } from '../format'
import type { Data } from '../useData'
import { classShort, DROP, JudgementCards, PACE, statusLabel } from './Judgement'

const KIND = { bulk: '増量', cut: '減量', checkpoint: '' } as const
const pct = (x: number | null) => (x === null ? '—' : `${signed(x)}%`)

/** 保存するのは、フェーズから決まる日付を除いた部分だけ */
export function storedCycle(c: ResolvedCycle): Omit<CycleT, 'updatedAt' | 'deleted'> {
  return {
    id: c.id,
    name: c.name,
    phaseIds: c.phaseIds,
    baseWeight: c.baseWeight,
    baseTotal: c.baseTotal,
    requiredPaceFactor: c.requiredPaceFactor,
    projectionMultiplier: c.projectionMultiplier,
    memo: c.memo,
    nextNote: c.nextNote,
  }
}

function PhaseRows({ p, s }: { p: PhaseSummary; s: Settings }) {
  const plan = phasePace(p.phase)
  return (
    <>
      <tr>
        <th colSpan={2} style={{ color: 'var(--text)', paddingTop: 12 }}>
          <b>{p.phase.name}</b>
          <span className="muted">
            　{KIND[p.phase.kind]}　{shortDate(p.phase.startDate as string)}〜{shortDate(p.phase.endDate)}
            {p.pending ? '　これから' : p.done ? '' : `　${p.days}日目`}
          </span>
        </th>
      </tr>
      {!p.pending && (
        <>
          <tr>
            <th>
              体重
              <div className="muted">
                {f1(p.weightStart)} → {f1(p.weightEnd)} kg
              </div>
            </th>
            <td>
              {signed(p.weightChange)} kg
              <div className="muted">
                {signed(p.pacePerMonth)} kg/月{plan !== null && `（計画 ${signed(plan)}）`}
              </div>
            </td>
          </tr>
          <tr>
            <th>
              推定トータル
              <div className="muted">
                {f1(p.totalStart)} → {f1(p.totalEnd)} kg
              </div>
            </th>
            <td>
              {signed(p.totalChange)} kg（{pct(p.totalChangePct)}）
              <div className="muted">体重補正後 {signed(p.adjChange)} kg</div>
            </td>
          </tr>
          <tr>
            {/* 値が長いので、表の幅を押し広げないよう1列にまとめる */}
            <th colSpan={2}>
              種目別
              <span className="num" style={{ float: 'right', color: 'var(--text)' }}>
                {LIFTS.map((l) => `${l} ${signed(p.liftChange[l])}`).join('　')}
              </span>
            </th>
          </tr>
          {s.show.waist && (
            <tr>
              <th>ウエスト</th>
              <td>{signed(p.waistChange)} cm</td>
            </tr>
          )}
          {s.show.nutrition && (
            <tr>
              <th>平均摂取</th>
              <td>
                {f0(p.avgKcal)} kcal{p.avgProtein !== null && `／P ${f0(p.avgProtein)}g`}
              </td>
            </tr>
          )}
          {s.show.heartRate && (
            <tr>
              <th>睡眠時心拍数の平均</th>
              <td>{f1(p.avgSleepHr)} bpm</td>
            </tr>
          )}
          <tr>
            <th>体重を記録した日</th>
            <td>{Math.round(p.logRate * 100)}%</td>
          </tr>
        </>
      )}
    </>
  )
}

/** 記録から自動で出す、サイクルの実績 */
export function SummaryCard({ sum, data }: { sum: CycleSummary; data: Data }) {
  const s = data.settings
  const ratios = LIFTS.filter((l) => sum.maxRatio[l] !== null)
  return (
    <div className="card">
      <h2>まとめ{sum.started && `（${shortDate(sum.to)}まで）`}</h2>
      {!sum.started ? (
        <div className="sub">このサイクルはまだ始まっていません。</div>
      ) : (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>サイクル全体の体重</th>
                <td>{signed(sum.weightChange)} kg</td>
              </tr>
              <tr>
                <th>
                  体重補正後トータルの伸び
                  <div className="muted">強くなったぶん（体重の増減を除く）</div>
                </th>
                <td>
                  <b>{signed(sum.adjChange)} kg</b>
                </td>
              </tr>
              {s.show.nutrition && (
                <tr>
                  <th>
                    推定の維持カロリー
                    <div className="muted">{sum.maintenance.ok ? '期間中の摂取と体重の傾きから' : sum.maintenance.reason}</div>
                  </th>
                  <td>{f0(sum.maintenance.maintenance)} kcal</td>
                </tr>
              )}
              {sum.phases.map((p) => (
                <PhaseRows key={p.phase.id} p={p} s={s} />
              ))}
            </tbody>
          </table>
          {ratios.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>実測MAXと推定1RM</h2>
              <table className="kv">
                <tbody>
                  {ratios.map((l) => {
                    const r = sum.maxRatio[l]!
                    return (
                      <tr key={l}>
                        <th>
                          {l}（{shortDate(r.date)}）
                          <div className="muted">
                            実測 {f1(r.measured)} ÷ 推定 {f1(r.estimated)}
                          </div>
                        </th>
                        <td>{pct((r.ratio - 1) * 100)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="muted" style={{ marginTop: 6 }}>
                プラスなら、{data.formula.formula.name}の推定より実際のほうが挙がる種目。推定は測定日より前の2週間の記録から。
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** 振り返りのメモ。本人が書く */
function MemoCard({ cycle, toast }: { cycle: ResolvedCycle; toast: (m: string) => void }) {
  const [memo, setMemo] = useState(cycle.memo)
  const [nextNote, setNext] = useState(cycle.nextNote)
  useEffect(() => {
    setMemo(cycle.memo)
    setNext(cycle.nextNote)
  }, [cycle.id, cycle.memo, cycle.nextNote])
  const dirty = memo !== cycle.memo || nextNote !== cycle.nextNote
  return (
    <div className="card stack">
      <h2>振り返り</h2>
      <label className="field">
        <span>うまくいったこと・気づいたこと</span>
        <textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      <label className="field">
        <span>次のサイクルで変えること</span>
        <textarea rows={3} value={nextNote} onChange={(e) => setNext(e.target.value)} />
      </label>
      <div className="muted">「次で変えること」は、次のサイクルを開いたときに一番上に出ます。</div>
      <button
        type="button"
        className="btn"
        style={{ width: '100%' }}
        disabled={!dirty}
        onClick={async () => {
          await put('cycles', { ...storedCycle(cycle), memo: memo.trim(), nextNote: nextNote.trim() })
          toast('振り返りを保存しました')
        }}
      >
        {dirty ? '振り返りを保存' : '保存済み'}
      </button>
    </div>
  )
}

/** サイクル同士を並べる。増量のペースと伸び、減量での落ち方を見比べる */
function Compare({ rows, s }: { rows: { j: J; sum: CycleSummary }[]; s: Settings }) {
  const of = (sum: CycleSummary, kind: 'bulk' | 'cut') => sum.phases.filter((p) => p.phase.kind === kind && !p.pending)
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const total = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  }
  return (
    <div className="card">
      <h2>サイクルの比較</h2>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>サイクル</th>
              <th>増量 kg/月</th>
              <th>補正後の伸び</th>
              <th>減量 kg/月</th>
              <th>減量の落ち幅</th>
              {s.show.nutrition && <th>維持kcal</th>}
              <th>目標へのペース</th>
              {s.classChoice && <th>階級</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ j, sum }) => (
              <tr key={j.cycle.id}>
                <td style={{ textAlign: 'left' }}>
                  {j.cycle.name}
                  {!j.final && '（途中）'}
                </td>
                <td>{signed(avg(of(sum, 'bulk').map((p) => p.pacePerMonth)))}</td>
                <td>{signed(sum.adjChange)}</td>
                <td>{signed(avg(of(sum, 'cut').map((p) => p.pacePerMonth)))}</td>
                <td>
                  {j.dropPct !== null
                    ? `${f1(j.drop)}kg（${j.dropPct.toFixed(1)}%）`
                    : pct(total(of(sum, 'cut').map((p) => p.totalChangePct)))}
                </td>
                {s.show.nutrition && <td>{f0(sum.maintenance.maintenance)}</td>}
                <td>{j.pace ? PACE[j.pace].label : '—'}</td>
                {s.classChoice && <td>{j.classVerdict ? classShort(j.classVerdict, s) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        落ち幅の判定：{Object.values(DROP).map((d) => d.short).join('／')}は各サイクルの「減量での落ち幅」を参照。
      </div>
    </div>
  )
}

export function Cycle(props: { data: Data; toast: (m: string) => void; openReport: (cycleId: string) => void }) {
  const { data } = props
  const today = todayISO()
  const rows = useMemo(
    () =>
      data.cycles.map((c) => ({
        j: judge(data.settings, c, data.dailyLogs, data.topSets, today),
        sum: summarizeCycle(data.settings, c, data, today),
      })),
    [data, today],
  )
  // 最初は、今日を含むサイクル（無ければ最後に始まったもの）
  const [picked, setPicked] = useState<string | null>(null)
  const index = Math.max(
    0,
    rows.findIndex((r) => r.j.cycle.id === picked) >= 0
      ? rows.findIndex((r) => r.j.cycle.id === picked)
      : rows.findIndex((r) => r.j.cycle.baseDate < today && today <= r.j.cycle.endDate) >= 0
        ? rows.findIndex((r) => r.j.cycle.baseDate < today && today <= r.j.cycle.endDate)
        : rows.findLastIndex((r) => r.j.cycle.baseDate < today),
  )
  const current = rows[index]

  if (!current) {
    return (
      <>
        <div className="page-head">
          <h1>サイクル</h1>
        </div>
        <div className="card sub">
          サイクルがありません。計画タブの「サイクル」で、まとめて振り返りたいフェーズ（増量・減量）を選んでください。
        </div>
      </>
    )
  }

  const c = current.j.cycle
  const prev = index > 0 ? rows[index - 1].j.cycle : null
  return (
    <>
      <div className="page-head">
        <h1>サイクル</h1>
        <span className="badge">{statusLabel(current.j)}</span>
      </div>

      {rows.length > 1 && (
        <label className="field" style={{ marginBottom: 12 }}>
          <span>表示するサイクル</span>
          <select value={c.id} onChange={(e) => setPicked(e.target.value)}>
            {rows.map((r) => (
              <option key={r.j.cycle.id} value={r.j.cycle.id}>
                {r.j.cycle.name}（{r.j.cycle.baseDate}〜{r.j.cycle.endDate}）
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="card sub">
        <b style={{ color: 'var(--text)' }}>{c.name}</b>　{c.phases.map((p) => p.name).join(' → ')}
        <div>
          基準 {shortDate(c.baseDate)}（{f1(c.baseWeight)}kg）〜 {shortDate(c.endDate)}／{data.formula.formula.name}
        </div>
      </div>

      {prev && prev.nextNote !== '' && (
        <div className="card">
          <h2>前回（{prev.name}）に決めたこと</h2>
          <div style={{ whiteSpace: 'pre-wrap' }}>{prev.nextNote}</div>
        </div>
      )}

      <SummaryCard sum={current.sum} data={data} />
      <MemoCard cycle={c} toast={props.toast} />
      <JudgementCards j={current.j} data={data} />
      {rows.length > 1 && <Compare rows={rows} s={data.settings} />}

      <button type="button" className="btn" style={{ width: '100%' }} onClick={() => props.openReport(c.id)}>
        レポートを開く（印刷・PDF）
      </button>
    </>
  )
}
