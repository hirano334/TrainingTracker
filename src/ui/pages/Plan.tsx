import { useEffect, useState } from 'react'
import { estimateMaintenance } from '../../domain/energy'
import { todayISO } from '../../domain/weeks'
import { DateField, NumField, Seg, TextField } from '../components/Fields'
import { f0, signed } from '../format'
import type { Data } from '../useData'
import { useSettingsDraft } from '../useSettingsDraft'
import { PhaseForm, PhaseRow } from './PhaseForm'
import { CyclesCard } from './SettingsCalc'

interface Props {
  data: Data
  toast: (msg: string) => void
}

const ESTIMATE_DAYS = [14, 21, 28] as const

/** 摂取カロリーと体重推移から維持カロリーを逆算して見せる */
function MaintenanceEstimate(props: { data: Data; kcalPerKg: number; onUse: (kcal: number) => void }) {
  const [days, setDays] = useState<(typeof ESTIMATE_DAYS)[number]>(14)
  const e = estimateMaintenance(props.data.dailyLogs, todayISO(), days, props.kcalPerKg)
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <div className="row between">
        <span className="label" style={{ margin: 0 }}>
          記録から推定
        </span>
        <div style={{ width: 200 }}>
          <Seg options={ESTIMATE_DAYS} value={days} onChange={setDays} label="推定に使う日数" render={(d) => `${d}日`} className="top" />
        </div>
      </div>
      {e.ok && e.maintenance !== null && e.avgKcal !== null && e.slopePerDay !== null ? (
        <>
          <div className="sub num">
            平均摂取 {f0(e.avgKcal)} kcal（{e.kcalDays}日分）、体重の傾き {signed(e.slopePerDay * 7, 2)} kg/週 →
            維持 <b style={{ color: 'var(--text)' }}>{f0(e.maintenance)} kcal</b>
          </div>
          <button type="button" className="link" onClick={() => props.onUse(Math.round((e.maintenance as number) / 10) * 10)}>
            {Math.round(e.maintenance / 10) * 10} kcal を使う
          </button>
        </>
      ) : (
        <div className="muted">{e.reason}</div>
      )}
      <div className="muted">
        平均摂取カロリー − 体重の傾き × {props.kcalPerKg}kcal/kg。増量・減量を始めた直後は水分の増減で体重が動くので、ずれやすい。
      </div>
    </div>
  )
}

/** 段の見出し。番号と一言の説明 */
function Step(props: { n: number; title: string; lead: string; hint?: string | false }) {
  return (
    <>
      <h2 style={{ marginBottom: 2 }}>
        <span className="step">{props.n}</span>
        {props.title}
      </h2>
      <div className="muted">{props.lead}</div>
      {props.hint && <div className="start-here">{props.hint}</div>}
    </>
  )
}

/** ① 目標：目標トータル・大会・階級・維持カロリー */
function GoalCard({ data, toast }: Props) {
  const { d, set, dirty, save } = useSettingsDraft(data, toast)
  // 着地目標は「81, 82」のように打つ途中の文字も保ちたいので、文字列でも持つ
  const [landing, setLanding] = useState(data.settings.upperLandingTargetsKg.join(', '))
  useEffect(() => setLanding(data.settings.upperLandingTargetsKg.join(', ')), [data.settings.upperLandingTargetsKg])

  return (
    <div className="card stack">
      <Step
        n={1}
        title="目標"
        lead="届かせたいトータルと大会。サイクルの振り返りで、このトータルに届くペースかを見ます。"
        hint={data.settings.goalTotal === null && 'まずは目標トータルを入れてください'}
      />
      <NumField
        label={d.classChoice ? `目標トータル kg（${d.lowerClassName}の標準記録など）` : '目標トータル kg（標準記録など）'}
        value={d.goalTotal}
        onChange={(v) => set('goalTotal', v)}
        placeholder="未定"
      />
      <div className="grid2">
        <DateField label="本命大会" value={d.mainMeetDate} onChange={(v) => set('mainMeetDate', v)} />
        <DateField label="ほかの大会（任意）" value={d.springMeetDate} onChange={(v) => set('springMeetDate', v)} />
      </div>

      <label className="toggle">
        <span>
          階級の判定を使う
          <span className="muted" style={{ display: 'block' }}>
            いまの階級に残るか、上の階級に上げるかを迷っている場合
          </span>
        </span>
        <input type="checkbox" checked={d.classChoice} onChange={(e) => set('classChoice', e.target.checked)} />
      </label>
      {d.classChoice && (
        <div className="stack">
          <div className="grid2">
            <TextField label="いまの階級" value={d.lowerClassName} onChange={(v) => set('lowerClassName', v)} placeholder="74kg級" />
            <TextField label="上の階級" value={d.upperClassName} onChange={(v) => set('upperClassName', v)} placeholder="83kg級" />
            <NumField
              label="上の階級の標準記録 kg"
              value={d.upperClassStandard}
              onChange={(v) => set('upperClassStandard', v)}
              placeholder="任意"
            />
            <TextField
              label="上げる場合の着地目標 kg"
              value={landing}
              onChange={(t) => {
                setLanding(t)
                set(
                  'upperLandingTargetsKg',
                  t
                    .split(/[,、\s]+/)
                    .map(Number)
                    .filter((n) => Number.isFinite(n) && n > 0),
                )
              }}
              placeholder="81, 82"
            />
          </div>
          <NumField
            label="上げるのに使える月数"
            value={d.upperRouteMonths}
            onChange={(v) => set('upperRouteMonths', v)}
            placeholder="空欄なら本命大会までの月数"
          />
          <TextField
            label="「どちらも可」のときの判断材料（任意）"
            value={d.classNote}
            onChange={(v) => set('classNote', v)}
            placeholder="例：下の階級は体脂肪11〜12%を維持"
          />
        </div>
      )}

      {d.show.nutrition && (
        <div>
          <NumField
            label="維持カロリー kcal（体重が変わらない摂取量）"
            value={d.maintenanceKcal}
            onChange={(v) => set('maintenanceKcal', v)}
            placeholder="未定"
          />
          <MaintenanceEstimate data={data} kcalPerKg={d.kcalPerKg} onUse={(kcal) => set('maintenanceKcal', kcal)} />
        </div>
      )}

      <button type="button" className="btn primary" onClick={() => void save('目標を保存しました')} disabled={!dirty}>
        {dirty ? '目標を保存' : '保存済み'}
      </button>
    </div>
  )
}

/** ② フェーズ：増量期・減量期 */
function PhasesCard({ data, toast }: Props) {
  const [adding, setAdding] = useState(false)
  const usable = data.phases.filter((p) => p.kind !== 'checkpoint')
  return (
    <div className="card">
      <Step
        n={2}
        title="フェーズ"
        lead="増量期・減量期の期間と目標体重。増減幅を選ぶと、目標体重とカロリーが決まります。"
        hint={usable.length === 0 && 'まずは最初のフェーズを追加してください'}
      />
      {data.phases.map((p) => (
        <PhaseRow key={p.id} data={data} phase={p} toast={toast} />
      ))}
      {adding ? (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <h2 style={{ marginTop: 12 }}>新しいフェーズ</h2>
          <PhaseForm data={data} toast={toast} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setAdding(true)}>
          ＋ フェーズを追加
        </button>
      )}
    </div>
  )
}

export function Plan({ data, toast }: Props) {
  const noCycle = data.cycles.length === 0 && data.unresolvedCycles.length === 0
  return (
    <>
      <div className="page-head">
        <h1>計画</h1>
      </div>
      <GoalCard data={data} toast={toast} />
      <PhasesCard data={data} toast={toast} />
      <CyclesCard
        data={data}
        toast={toast}
        header={
          <Step
            n={3}
            title="サイクル"
            lead="フェーズを選んで、まとめて振り返る単位にします（例：増量1 → 減量1）。"
            hint={noCycle && data.phases.length > 0 && 'フェーズができたら、サイクルにまとめてください'}
          />
        }
      />
    </>
  )
}
