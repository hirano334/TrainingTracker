import { useEffect, useState, type ReactNode } from 'react'
import { newId, put, remove } from '../../db/db'
import { resolveCycle, usablePhases } from '../../domain/cycles'
import { DEFAULT_CYCLE_FACTORS } from '../../domain/defaults'
import { checkpointTotals } from '../../domain/e1rm'
import { FUNCTION_NAMES } from '../../domain/expr'
import {
  allFormulas,
  BUILTIN_FORMULAS,
  compileFormula,
  DEFAULT_FORMULA_ID,
  validateFormula,
} from '../../domain/formulas'
import { suggestFactors } from '../../domain/planning'
import type { Cycle } from '../../domain/types'
import { shortDate } from '../../domain/weeks'
import { avgWeightInWindow } from '../../domain/weight'
import { NumField, TextField } from '../components/Fields'
import { f1 } from '../format'
import { storedCycle } from './Cycle'
import type { SettingsProps } from './Settings'

/** 式どうしを見比べるための例 */
const EXAMPLES = [
  { label: '100kg×3 RPE8', w: 100, reps: 3, rpe: 8 },
  { label: '200kg×1 RPE10', w: 200, reps: 1, rpe: 10 },
] as const

export function FormulaCard({ data, toast }: SettingsProps) {
  const s = data.settings
  const formulas = allFormulas(s)
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const problem = expr.trim() === '' ? null : validateFormula(expr)
  const canAdd = name.trim() !== '' && expr.trim() !== '' && problem === null

  const select = async (id: string) => {
    await put('settings', { ...s, e1rmFormulaId: id })
    toast('推定1RMの式を変更しました')
  }
  const add = async () => {
    const id = newId()
    await put('settings', {
      ...s,
      customFormulas: [...s.customFormulas, { id, name: name.trim(), expr: expr.trim() }],
      e1rmFormulaId: id,
    })
    setName('')
    setExpr('')
    toast('式を追加して選択しました')
  }
  const del = async (id: string) => {
    if (!confirm('この式を削除しますか？')) return
    await put('settings', {
      ...s,
      customFormulas: s.customFormulas.filter((f) => f.id !== id),
      e1rmFormulaId: s.e1rmFormulaId === id ? DEFAULT_FORMULA_ID : s.e1rmFormulaId,
    })
    toast('式を削除しました')
  }

  // 式を変えると、保存済みの基準トータル（数値）と食い違う
  const fn = data.formula.fn
  const stale = data.cycles
    .map((c) => ({ c, total: checkpointTotals(data.topSets, c.baseDate, fn).total }))
    .filter((x) => x.total !== null && (x.c.baseTotal === null || Math.abs(x.total - x.c.baseTotal) >= 0.05))

  return (
    <div className="card stack">
      {data.formula.fallbackReason && (
        <div className="sub" role="alert" style={{ color: 'var(--critical)' }}>
          {data.formula.fallbackReason}。Epley で計算しています。
        </div>
      )}
      <label className="field">
        <span>使う式</span>
        <select value={data.formula.formula.id} onChange={(e) => void select(e.target.value)}>
          {formulas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>式</th>
              {EXAMPLES.map((x) => (
                <th key={x.label}>{x.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {formulas.map((f) => {
              const bad = validateFormula(f.expr)
              const custom = !BUILTIN_FORMULAS.some((b) => b.id === f.id)
              return (
                <tr key={f.id}>
                  <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                    <b>{f.name}</b>
                    <div className="muted" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {f.expr}
                    </div>
                    {bad && <div style={{ color: 'var(--critical)' }}>{bad}</div>}
                  </td>
                  {EXAMPLES.map((x) => (
                    <td key={x.label}>{bad ? '—' : f1(compileFormula(f.expr)(x.w, x.reps, x.rpe))}</td>
                  ))}
                  <td>
                    {custom && (
                      <button type="button" className="link" style={{ color: 'var(--critical)' }} onClick={() => void del(f.id)}>
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {stale.length > 0 && (
        <div className="stack">
          <div className="sub">
            基準トータルが、いまの式で計算した値と違います。式を変えたあとは、同じ式で入れ直すと比較が揃います。
          </div>
          {stale.map(({ c, total }) => (
            <button
              key={c.id}
              type="button"
              className="btn small"
              onClick={async () => {
                await put('cycles', { ...storedCycle(c), baseTotal: Number((total as number).toFixed(1)) })
                toast(`${c.name}の基準トータルを更新しました`)
              }}
            >
              {c.name}：{f1(c.baseTotal)} → {f1(total)} kg に計算し直す
            </button>
          ))}
        </div>
      )}

      <details>
        <summary>独自の式を追加</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <TextField label="名前" value={name} onChange={setName} placeholder="例：自分用" />
          <label className="field">
            <span>式</span>
            <input
              type="text"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="w * (1 + r / 30)"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, monospace' }}
            />
          </label>
          {expr.trim() !== '' &&
            (problem ? (
              <div className="sub" style={{ color: 'var(--critical)' }}>
                {problem}
              </div>
            ) : (
              <div className="sub num">
                {EXAMPLES.map((x) => `${x.label} → ${f1(compileFormula(expr)(x.w, x.reps, x.rpe))}kg`).join('　')}
              </div>
            ))}
          <div className="muted">
            変数：w 重量、reps 回数、rpe、rir（10 − rpe）、r（reps + rir）。演算：+ − * / ^ と括弧。関数：
            {FUNCTION_NAMES.join(', ')}。数式だけを解釈し、プログラムとしては実行しません。
          </div>
          <button type="button" className="btn" style={{ width: '100%' }} disabled={!canAdd} onClick={() => void add()}>
            追加して選択
          </button>
        </div>
      </details>
    </div>
  )
}

type Draft = Omit<Cycle, 'updatedAt' | 'deleted'>

const KIND = { bulk: '増量', cut: '減量', checkpoint: '' } as const

function CycleEditor({ cycle, data, toast }: SettingsProps & { cycle: Draft }) {
  const [d, setD] = useState(cycle)
  useEffect(() => setD(cycle), [cycle])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const num = (k: 'baseWeight' | 'requiredPaceFactor' | 'projectionMultiplier') => (v: number | null) => {
    if (v !== null) set(k, v)
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(cycle)

  const candidates = usablePhases(data.phases)
  // 選んだフェーズから決まる日付
  const span = resolveCycle({ ...d, updatedAt: 0 }, data.phases)
  const measuredWeight = span ? avgWeightInWindow(data.dailyLogs, span.baseDate) : null
  const measuredTotal = span ? checkpointTotals(data.topSets, span.baseDate, data.formula.fn).total : null
  const suggested = span ? suggestFactors({ baseDate: span.baseDate, cutEndDate: span.endDate }, data.settings.mainMeetDate) : null
  const differs =
    suggested !== null &&
    (suggested.requiredPaceFactor !== d.requiredPaceFactor || suggested.projectionMultiplier !== d.projectionMultiplier)

  return (
    <details>
      <summary>
        <b style={{ color: 'var(--text)' }}>{cycle.name}</b>
        {'　'}
        {span ? `${span.phases.map((p) => p.name).join(' → ')}（〜${span.endDate}）` : 'フェーズ未選択'}
        {'　'}基準 {f1(cycle.baseTotal)}kg
      </summary>
      <div className="stack" style={{ margin: '8px 0 16px' }}>
        <TextField label="名前" value={d.name} onChange={(v) => set('name', v)} />
        <div>
          <span className="label">このサイクルに含めるフェーズ</span>
          {candidates.length === 0 && <div className="muted">開始日のある増量・減量のフェーズが、フェーズ表にありません。</div>}
          {candidates.map((p) => (
            <label className="toggle" key={p.id}>
              <span>
                {p.name}
                <span className="muted" style={{ display: 'block' }}>
                  {KIND[p.kind]}　{p.startDate}〜{p.endDate}
                </span>
              </span>
              <input
                type="checkbox"
                checked={d.phaseIds.includes(p.id)}
                onChange={(e) =>
                  set('phaseIds', e.target.checked ? [...d.phaseIds, p.id] : d.phaseIds.filter((x) => x !== p.id))
                }
              />
            </label>
          ))}
          <div className="muted">
            {span
              ? `基準日 ${span.baseDate}（最初のフェーズの前日）〜 ${span.endDate}。日付はフェーズ表で変えます。`
              : 'フェーズを1つ以上選ぶと、まとめと判定が出ます。'}
          </div>
        </div>
        <div>
          <NumField
            label={`基準体重 kg${span ? `（${shortDate(span.baseDate)}の実測値）` : ''}`}
            value={d.baseWeight}
            onChange={num('baseWeight')}
          />
          {measuredWeight !== null && (
            <button type="button" className="link" onClick={() => set('baseWeight', Number(measuredWeight.toFixed(1)))}>
              基準日までの7日平均 {f1(measuredWeight)}kg を使う
            </button>
          )}
        </div>
        <div>
          <NumField label="基準トータル kg" value={d.baseTotal} onChange={(v) => set('baseTotal', v)} placeholder="未定" />
          {measuredTotal !== null && (
            <button type="button" className="link" onClick={() => set('baseTotal', Number(measuredTotal.toFixed(1)))}>
              基準日までの2週の推定1RM合計 {f1(measuredTotal)}kg を使う
            </button>
          )}
          <div className="muted">
            判定で比べる相手は推定1RM（{data.formula.formula.name}）なので、ここも同じ方法の値にすると比較が揃います。
          </div>
        </div>
        <div className="grid2">
          <NumField label="必要ペースの係数" value={d.requiredPaceFactor} onChange={num('requiredPaceFactor')} />
          <NumField label="本命大会時点の予測の倍率" value={d.projectionMultiplier} onChange={num('projectionMultiplier')} />
        </div>
        {suggested && differs && (
          <button
            type="button"
            className="link"
            onClick={() =>
              setD((p) => ({
                ...p,
                requiredPaceFactor: suggested.requiredPaceFactor,
                projectionMultiplier: suggested.projectionMultiplier,
              }))
            }
          >
            本命大会まで約{suggested.cycles.toFixed(1)}サイクル → 係数 {suggested.requiredPaceFactor}、倍率{' '}
            {suggested.projectionMultiplier} を使う
          </button>
        )}
        <div className="muted">
          本命大会までの各サイクルで、伸びが 1 : 0.8 : 0.7 … と少しずつ鈍ると仮定した値。倍率はその合計、係数は 1 ÷ 倍率。
          {data.settings.mainMeetDate === null && '本命大会の日付を入れると、日付から計算した候補が出ます。'}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn grow"
            disabled={!dirty || d.name.trim() === ''}
            onClick={async () => {
              await put('cycles', d)
              toast('サイクルを保存しました')
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm(`「${cycle.name}」を削除しますか？振り返りのメモも消えます。`)) return
              await remove('cycles', cycle.id)
              toast('サイクルを削除しました')
            }}
          >
            削除
          </button>
        </div>
      </div>
    </details>
  )
}

export function CyclesCard({ data, toast, header }: SettingsProps & { header?: ReactNode }) {
  const drafts: Draft[] = [...data.cycles.map(storedCycle), ...data.unresolvedCycles]
  const add = async () => {
    // まだどのサイクルにも入っていないフェーズを、新しいサイクルの候補にする
    const used = new Set(drafts.flatMap((c) => c.phaseIds))
    const free = usablePhases(data.phases).filter((p) => !used.has(p.id))
    const last = data.cycles.at(-1)
    const first = free[0]
    const weight = first ? avgWeightInWindow(data.dailyLogs, first.startDate as string) : null
    await put('cycles', {
      id: newId(),
      name: `第${drafts.length + 1}サイクル`,
      phaseIds: free.map((p) => p.id),
      baseWeight: Number((weight ?? first?.startWeight ?? last?.baseWeight ?? data.settings.baseWeight).toFixed(1)),
      baseTotal: null,
      ...DEFAULT_CYCLE_FACTORS,
      memo: '',
      nextNote: '',
    })
    toast('サイクルを追加しました。含めるフェーズと基準値を確認してください')
  }
  return (
    <div className="card">
      {header ?? <h2>サイクル</h2>}
      <div className="muted">
        日付はフェーズから決まります。グラフの体重補正は、最初のサイクルの基準体重（{f1(data.refWeight)}kg）に換算します。
      </div>
      {drafts.map((c) => (
        <CycleEditor key={c.id} cycle={c} data={data} toast={toast} />
      ))}
      <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => void add()}>
        ＋ サイクルを追加
      </button>
    </div>
  )
}
