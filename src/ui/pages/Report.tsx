import { useMemo } from 'react'
import { computeAlerts } from '../../domain/alerts'
import { judge } from '../../domain/judgement'
import { addDays, todayISO } from '../../domain/weeks'
import type { Data } from '../useData'
import { ChartSet } from './Charts'
import { JudgementCards, statusLabel } from './Judgement'

/**
 * 印刷用の2列の配置に切り替え、グラフが新しい幅で描き直されるのを待ってから印刷する。
 * （印刷用のスタイルだけで幅を変えると、グラフの描き直しが間に合わない）
 */
function printReport() {
  const root = document.documentElement
  root.classList.add('printing')
  window.addEventListener('afterprint', () => root.classList.remove('printing'), { once: true })
  setTimeout(() => window.print(), 400)
}

/** 1サイクルぶんの判定とグラフをまとめた、印刷・PDF 用のページ */
export function Report({ data, cycleId, close }: { data: Data; cycleId: string; close: () => void }) {
  const today = todayISO()
  const s = data.settings
  const cycle = data.cycles.find((c) => c.id === cycleId)
  const j = useMemo(
    () => cycle && judge(s, cycle, data.dailyLogs, data.topSets, today),
    [s, cycle, data.dailyLogs, data.topSets, today],
  )
  if (!cycle || !j) {
    return (
      <div className="card sub">
        サイクルが見つかりません。
        <button type="button" className="link" onClick={close}>
          戻る
        </button>
      </div>
    )
  }
  // グラフは基準日の2週前から、判定に使った日まで
  const from = addDays(cycle.baseDate, -14)
  const alerts = computeAlerts(s, data.phases, data.dailyLogs, data.topSets, j.evalDate)

  return (
    <div className="report">
      <div className="row between no-print" style={{ marginBottom: 12 }}>
        <button type="button" className="btn small" onClick={close}>
          ← 戻る
        </button>
        <button type="button" className="btn small" onClick={printReport}>
          印刷 / PDF に保存
        </button>
      </div>

      <div className="page-head">
        <h1>判定レポート：{cycle.name}</h1>
        <span className="badge">{statusLabel(j)}</span>
      </div>
      <div className="card sub">
        基準日 {cycle.baseDate}（{cycle.baseWeight}kg）→ 増量終了 {cycle.bulkEndDate} → 減量終了 {cycle.cutEndDate}
        <div>作成日 {today}</div>
      </div>

      <JudgementCards j={j} data={data} />

      <div className="card">
        <h2>計算の前提</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>
                推定1RMの式
                <div className="muted">
                  w: 重量、r: 回数 + (10 − RPE){data.formula.fallbackReason && `／${data.formula.fallbackReason}`}
                </div>
              </th>
              <td style={{ whiteSpace: 'normal' }}>
                {data.formula.formula.name}
                <div className="muted">{data.formula.formula.expr}</div>
              </td>
            </tr>
            <tr>
              <th>目標トータル{s.classChoice && `（${s.lowerClassName}）`}</th>
              <td>{s.goalTotal ?? '—'} kg</td>
            </tr>
            <tr>
              <th>体重補正の指数</th>
              <td>{s.allometricExponent.toFixed(3)}</td>
            </tr>
            <tr>
              <th>必要ペースの係数 / 予測の倍率</th>
              <td>
                {cycle.requiredPaceFactor} / {cycle.projectionMultiplier}
              </td>
            </tr>
            <tr>
              <th>「境界」の下限</th>
              <td>必要ペース × {s.borderlineFactor}</td>
            </tr>
            <tr>
              <th>落ち幅の閾値（正常 / グレー）</th>
              <td>
                {s.dropNormalMaxPct} / {s.dropGreyMaxPct} %
              </td>
            </tr>
          </tbody>
        </table>
        <div className="muted" style={{ marginTop: 6 }}>
          トータルe1RM は直近2週の週ごとの最大値の平均。試合基準で挙げていないセットは含まない。
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="card">
          <h2>{j.evalDate} 時点のアラート</h2>
          {alerts.map((a) => (
            <div className="alert" key={a.id}>
              <span className="mark" aria-hidden>
                !
              </span>
              <div>
                <b>{a.title}</b>
                <div className="sub">{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ChartSet data={data} from={from} to={j.evalDate} compact />

    </div>
  )
}
