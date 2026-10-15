import { RECORD_REPS, records } from '../../domain/records'
import { LIFTS } from '../../domain/types'
import { shortDate } from '../../domain/weeks'
import { f1 } from '../format'
import type { Data } from '../useData'

/** 振り返り > 自己ベスト */
export function Bests({ data }: { data: Data }) {
  const best = records(data.topSets, data.formula.fn)
  return (
    <>
      <div className="page-head">
        <h1>自己ベスト</h1>
      </div>
      <div className="card">
        <h2>推定1RM のベスト</h2>
        <table className="kv">
          <tbody>
            {LIFTS.map((l) => {
              const b = best[l].bestE1rm
              return (
                <tr key={l}>
                  <th>
                    <b style={{ color: 'var(--text)' }}>{l}</b>
                    {b && (
                      <div className="muted">
                        {shortDate(b.set.date)}　{b.set.weight}kg × {b.set.reps}　RPE{b.set.rpe}
                      </div>
                    )}
                  </th>
                  <td>{b ? `${f1(b.value)} kg` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="muted" style={{ marginTop: 6 }}>{data.formula.formula.name}で計算。</div>
      </div>
      <div className="card">
        <h2>回数ごとの最高重量</h2>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>種目</th>
                {RECORD_REPS.map((r) => (
                  <th key={r}>{r}回</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIFTS.map((l) => (
                <tr key={l}>
                  <td style={{ textAlign: 'left' }}>
                    <b>{l}</b>
                  </td>
                  {RECORD_REPS.map((r) => (
                    <td key={r}>{best[l].byReps[r]?.weight ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted">試合基準で挙げたセットのみ。</div>
      </div>
    </>
  )
}
