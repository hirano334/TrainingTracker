import { useMemo, useState } from 'react'
import { newId, put, remove } from '../../db/db'
import {
  kcalPerDayFor,
  PACE_PRESETS,
  paceLabel,
  phasePace,
  planPhase,
  type PaceLevel,
  type PlanHow,
  type PlannedKind,
} from '../../domain/phasePlan'
import { targetWeightOf } from '../../domain/phases'
import type { Phase } from '../../domain/types'
import { addDays, diffDays, shortDate, todayISO } from '../../domain/weeks'
import { avgWeightInWindow } from '../../domain/weight'
import { DateField, NumField, Seg, TextField } from '../components/Fields'
import { f0, f1 } from '../format'
import type { Data } from '../useData'

type Mode = PlanHow['mode']
const MODES: Mode[] = ['preset', 'amount', 'target']
const MODE_LABEL: Record<Mode, string> = { preset: 'よくある幅', amount: 'n週で x kg', target: '終了日と目標' }
const KIND_LABEL: Record<PlannedKind, string> = { bulk: '増量', cut: '減量' }

type New<T> = Omit<T, 'updatedAt' | 'deleted'>

/**
 * フェーズの作成・編集。増減幅の決め方を選ぶと、終了日・目標体重・ペース・カロリーを自動で出す。
 * phase が無ければ新しいフェーズ。
 */
export function PhaseForm(props: {
  data: Data
  phase?: Phase
  toast: (m: string) => void
  onDone?: () => void
}) {
  const { data, phase } = props
  const s = data.settings
  const isNew = !phase

  // 新しいフェーズは、直前のフェーズの翌日から、その目標体重で始める
  const last = data.phases.filter((p) => p.kind !== 'checkpoint').at(-1)
  const today = todayISO()
  const defaults = useMemo(() => {
    const startDate = phase?.startDate ?? (last ? addDays(last.endDate, 1) : addDays(today, 1))
    const startWeight =
      phase?.startWeight ??
      (last ? targetWeightOf(last) : null) ??
      avgWeightInWindow(data.dailyLogs, today) ??
      s.baseWeight
    return { startDate, startWeight }
    // 開いたときの値だけを使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.id])

  const [name, setName] = useState(phase?.name ?? '')
  const [kind, setKind] = useState<PlannedKind>(
    phase && phase.kind !== 'checkpoint' ? phase.kind : last?.kind === 'bulk' ? 'cut' : 'bulk',
  )
  const [startDate, setStartDate] = useState<string | null>(defaults.startDate)
  const [startWeight, setStartWeight] = useState<number | null>(Number(defaults.startWeight.toFixed(1)))
  const [mode, setMode] = useState<Mode>(isNew ? 'preset' : 'target')
  const [level, setLevel] = useState<PaceLevel>('standard')
  const [weeks, setWeeks] = useState<number | null>(phase?.startDate ? Math.round(diffDays(addDays(phase.startDate, -1), phase.endDate) / 7) : 8)
  const [kg, setKg] = useState<number | null>(2)
  const [endDate, setEndDate] = useState<string>(phase?.endDate ?? addDays(defaults.startDate, 55))
  const originalTarget = phase ? targetWeightOf(phase) : null
  const [targetWeight, setTargetWeight] = useState<number | null>(originalTarget)
  // カロリーの手入力（空なら自動）
  const [manualKcal, setManualKcal] = useState(phase ? phase.kcalOffsetMin !== null || phase.kcalOffsetMax !== null : false)
  const [kcalMin, setKcalMin] = useState<number | null>(phase?.kcalOffsetMin ?? null)
  const [kcalMax, setKcalMax] = useState<number | null>(phase?.kcalOffsetMax ?? null)

  const how: PlanHow | null =
    mode === 'preset'
      ? weeks
        ? { mode, level, weeks }
        : null
      : mode === 'amount'
        ? weeks && kg
          ? { mode, weeks, kg }
          : null
        : targetWeight
          ? { mode, endDate, targetWeight }
          : null
  const plan =
    how && startDate && startWeight ? planPhase({ kind, startDate, startWeight, how }) : null
  const kcalAuto = plan ? kcalPerDayFor(plan.pacePerMonth, s.kcalPerKg) : null
  const maintenance = s.maintenanceKcal

  // 開始日の無い旧いフェーズ（「〜11/30」のような）は、名前・終了日・目標だけ直せる
  const legacy = !isNew && phase.startDate === null && startDate === null

  const save = async () => {
    if (!plan && !legacy) return
    // 目標が幅で入っている旧いフェーズは、目標を触っていなければ幅のまま残す
    const keepRange =
      phase && mode === 'target' && targetWeight === originalTarget && phase.targetWeightMin !== phase.targetWeightMax
    const target = plan?.targetWeight ?? targetWeight
    const row: New<Phase> = {
      id: phase?.id ?? newId(),
      name: name.trim() || `${KIND_LABEL[kind]}${data.phases.filter((p) => p.kind === kind).length + 1}`,
      kind,
      startDate: plan?.startDate ?? null,
      endDate: plan?.endDate ?? endDate,
      startWeight: plan?.startWeight ?? phase?.startWeight ?? null,
      targetWeightMin: keepRange ? phase.targetWeightMin : target,
      targetWeightMax: keepRange ? phase.targetWeightMax : target,
      targetPacePerMonth: plan?.pacePerMonth ?? phase?.targetPacePerMonth ?? null,
      paceNote: plan ? paceLabel(plan.pacePerMonth) : (phase?.paceNote ?? ''),
      kcalOffsetMin: manualKcal ? kcalMin : null,
      kcalOffsetMax: manualKcal ? (kcalMax ?? kcalMin) : null,
    }
    await put('phases', row)
    props.toast(isNew ? 'フェーズを追加しました' : 'フェーズを保存しました')
    props.onDone?.()
  }

  return (
    <div className="stack" style={{ margin: '8px 0 16px' }}>
      <div className="grid2">
        <TextField label="名前" value={name} onChange={setName} placeholder={`${KIND_LABEL[kind]}2 など`} />
        <div>
          <span className="label">種別</span>
          <Seg options={['bulk', 'cut'] as const} value={kind} onChange={setKind} label="種別" render={(k) => KIND_LABEL[k]} />
        </div>
        <DateField label="開始日" value={startDate} onChange={setStartDate} />
        <NumField label="開始体重 kg" value={startWeight} onChange={setStartWeight} />
      </div>

      <div>
        <span className="label">増減幅の決め方</span>
        <Seg options={MODES} value={mode} onChange={setMode} label="増減幅の決め方" render={(m) => MODE_LABEL[m]} className="top" />
        {mode === 'preset' && (
          <div className="stack">
            <Seg
              options={PACE_PRESETS[kind].map((p) => p.level)}
              value={level}
              onChange={setLevel}
              label="増減幅"
              render={(l) => {
                const p = PACE_PRESETS[kind].find((x) => x.level === l)!
                return (
                  <span style={{ lineHeight: 1.2 }}>
                    {p.label}
                    <br />
                    <small style={{ fontWeight: 500 }}>
                      {p.pctPerWeek > 0 ? '+' : '−'}
                      {Math.abs(p.pctPerWeek)}%/週
                    </small>
                  </span>
                )
              }}
            />
            <NumField label="週数" value={weeks} onChange={setWeeks} step="1" />
          </div>
        )}
        {mode === 'amount' && (
          <div className="grid2">
            <NumField label="週数" value={weeks} onChange={setWeeks} step="1" />
            <NumField label={`${kind === 'bulk' ? '増やす' : '減らす'} kg`} value={kg} onChange={setKg} />
          </div>
        )}
        {mode === 'target' && (
          <div className="grid2">
            <DateField label="終了日" value={endDate} onChange={(v) => v && setEndDate(v)} />
            <NumField label="目標体重 kg" value={targetWeight} onChange={setTargetWeight} />
          </div>
        )}
      </div>

      {plan ? (
        <table className="kv">
          <tbody>
            <tr>
              <th>期間</th>
              <td>
                {shortDate(plan.startDate)}〜{shortDate(plan.endDate)}（{Math.round(plan.days / 7)}週）
              </td>
            </tr>
            <tr>
              <th>体重</th>
              <td>
                {f1(plan.startWeight)} → <b>{f1(plan.targetWeight)}</b> kg
              </td>
            </tr>
            <tr>
              <th>ペース</th>
              <td>
                {paceLabel(plan.pacePerMonth)}
                <div className="muted">
                  {plan.pctPerWeek >= 0 ? '+' : '−'}
                  {Math.abs(plan.pctPerWeek).toFixed(2)}%/週
                </div>
              </td>
            </tr>
            <tr>
              <th>
                カロリー
                <div className="muted">ペース × {s.kcalPerKg}kcal/kg ÷ 30.4日</div>
              </th>
              <td>
                維持 {kcalAuto !== null && kcalAuto >= 0 ? '+' : '−'}
                {Math.abs(kcalAuto ?? 0)} kcal/日
                <div className="muted">
                  {maintenance !== null ? `1日 ${f0(maintenance + (kcalAuto ?? 0))} kcal` : '維持カロリー未入力'}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="muted">
          {legacy ? '開始日が無いフェーズです。開始日を入れると、ペースとカロリーを計算します。' : '入力が足りません。'}
        </div>
      )}

      <details open={manualKcal || undefined}>
        <summary>カロリーを手で決める</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <label className="toggle">
            <span>自動の値の代わりに、下の値を使う</span>
            <input type="checkbox" checked={manualKcal} onChange={(e) => setManualKcal(e.target.checked)} />
          </label>
          {manualKcal && (
            <div className="grid2">
              <NumField label="維持との差 kcal" value={kcalMin} onChange={setKcalMin} />
              <NumField label="幅を持たせる場合の上限" value={kcalMax} onChange={setKcalMax} placeholder="任意" />
            </div>
          )}
        </div>
      </details>

      <div className="row">
        <button type="button" className="btn grow" disabled={!plan && !legacy} onClick={() => void save()}>
          {isNew ? 'フェーズを追加' : '保存'}
        </button>
        {isNew ? (
          <button type="button" className="btn" onClick={props.onDone}>
            やめる
          </button>
        ) : (
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm(`「${phase.name}」を削除しますか？`)) return
              await remove('phases', phase.id)
              props.toast('フェーズを削除しました')
            }}
          >
            削除
          </button>
        )}
      </div>
    </div>
  )
}

/** フェーズ表の1行。開くと編集できる */
export function PhaseRow({ data, phase, toast }: { data: Data; phase: Phase; toast: (m: string) => void }) {
  const target = targetWeightOf(phase)
  const pace = phasePace(phase)
  return (
    <details>
      <summary>
        <b style={{ color: 'var(--text)' }}>{phase.name}</b>　{phase.startDate ? shortDate(phase.startDate) : ''}〜
        {shortDate(phase.endDate)}
        {target !== null && `　→ ${f1(target)}kg`}
        {pace !== null && `（${paceLabel(pace)}）`}
      </summary>
      {phase.kind === 'checkpoint' ? (
        <div className="row" style={{ margin: '8px 0 16px' }}>
          <span className="sub grow">旧版の「判定」の目印です。今は使っていません。</span>
          <button
            type="button"
            className="btn small danger"
            onClick={async () => {
              await remove('phases', phase.id)
              toast('削除しました')
            }}
          >
            削除
          </button>
        </div>
      ) : (
        <PhaseForm data={data} phase={phase} toast={toast} />
      )}
    </details>
  )
}
