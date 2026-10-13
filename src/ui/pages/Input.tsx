import { useEffect, useState, type ReactNode } from 'react'
import { newId, put, remove } from '../../db/db'
import { e1rm } from '../../domain/e1rm'
import { LIFTS, type Lift, type TableName } from '../../domain/types'
import { shortDate, todayISO, weekStart } from '../../domain/weeks'
import { DateField, NumField, Seg, TextField } from '../components/Fields'
import { Stepper } from '../components/Stepper'
import { f1 } from '../format'
import type { Data } from '../useData'

const KINDS = ['体重', 'トレ', 'ウエスト', '測定'] as const
type Kind = (typeof KINDS)[number]

const REPS = [1, 2, 3, 4, 5] as const
const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const
const FATIGUE = [1, 2, 3, 4, 5] as const

interface FormProps {
  data: Data
  toast: (msg: string) => void
}

export function Input({ data, toast }: FormProps) {
  const today = todayISO()
  // 朝はまず体重。今日の体重が入っていればトレーニングから
  const [kind, setKind] = useState<Kind>(() =>
    data.dailyLogs.some((l) => l.date === today) ? 'トレ' : '体重',
  )
  return (
    <>
      <div className="page-head">
        <h1>入力</h1>
      </div>
      <Seg options={KINDS} value={kind} onChange={setKind} label="入力する項目" className="top" />
      {kind === '体重' && <WeightForm data={data} toast={toast} />}
      {kind === 'トレ' && <SetForm data={data} toast={toast} />}
      {kind === 'ウエスト' && <WaistForm data={data} toast={toast} />}
      {kind === '測定' && <CheckpointForm data={data} toast={toast} />}
    </>
  )
}

/** 直近の記録。タップで呼び出して直せる */
function Recent<T>(props: {
  title: string
  rows: T[]
  keyOf: (r: T) => string
  table: TableName
  render: (r: T) => ReactNode
  onPick: (r: T) => void
  toast: (msg: string) => void
}) {
  if (props.rows.length === 0) return null
  return (
    <div className="card">
      <h2>{props.title}</h2>
      <ul className="list">
        {props.rows.map((r) => (
          <li key={props.keyOf(r)}>
            <button type="button" className="main num" onClick={() => props.onPick(r)}>
              {props.render(r)}
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={async () => {
                if (!confirm('この記録を削除しますか？')) return
                await remove(props.table, props.keyOf(r))
                props.toast('削除しました')
              }}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeightForm({ data, toast }: FormProps) {
  const [date, setDate] = useState(todayISO())
  const existing = data.dailyLogs.find((l) => l.date === date)
  const last = data.dailyLogs.filter((l) => l.date < date).at(-1)
  const [weight, setWeight] = useState<number | null>(null)
  const [bodyFatPct, setBodyFat] = useState<number | null>(null)
  const [kcal, setKcal] = useState<number | null>(null)
  const [proteinG, setProtein] = useState<number | null>(null)

  // 日付を変えたら、その日の記録（無ければ直前の体重）を出す
  useEffect(() => {
    setWeight(existing?.weight ?? last?.weight ?? data.settings.baseWeight)
    setBodyFat(existing?.bodyFatPct ?? null)
    setKcal(existing?.kcal ?? null)
    setProtein(existing?.proteinG ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt])

  const save = async () => {
    if (weight === null || weight <= 0) return
    await put('dailyLogs', { date, weight, bodyFatPct, kcal, proteinG })
    toast('体重を保存しました')
  }

  return (
    <>
      <div className="card stack">
        <DateField label="日付" value={date} onChange={(v) => v && setDate(v)} />
        <div>
          <span className="label">体重（起床後・排尿後）kg{existing ? '　※この日は入力済み' : ''}</span>
          <Stepper label="体重" value={weight} onChange={setWeight} step={0.1} />
        </div>
        <details open={bodyFatPct !== null || kcal !== null || proteinG !== null || undefined}>
          <summary>体脂肪率・カロリー・タンパク質（任意）</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <NumField label="体脂肪率 %（体重計の表示値）" value={bodyFatPct} onChange={setBodyFat} />
            <div className="grid2">
              <NumField label="摂取カロリー kcal" value={kcal} onChange={setKcal} />
              <NumField label="タンパク質 g" value={proteinG} onChange={setProtein} />
            </div>
          </div>
        </details>
        <button type="button" className="btn primary" onClick={save} disabled={weight === null || weight <= 0}>
          保存
        </button>
      </div>
      <Recent
        title="直近の記録"
        rows={data.dailyLogs.slice(-7).reverse()}
        keyOf={(l) => l.date}
        table="dailyLogs"
        onPick={(l) => setDate(l.date)}
        toast={toast}
        render={(l) => (
          <>
            {shortDate(l.date)}　<b>{f1(l.weight)}</b> kg
            {l.bodyFatPct !== null && `　${f1(l.bodyFatPct)}%`}
            {l.kcal !== null && `　${l.kcal}kcal`}
          </>
        )}
      />
    </>
  )
}

function SetForm({ data, toast }: FormProps) {
  const [id, setId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [lift, setLift] = useState<Lift | null>(null)
  const [weight, setWeight] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [comp, setComp] = useState(true)
  const [memo, setMemo] = useState('')

  const pickLift = (l: Lift) => {
    setLift(l)
    // 重量は前回の同じ種目の値から始める
    if (id === null) setWeight(data.topSets.filter((s) => s.lift === l).at(-1)?.weight ?? null)
  }
  const reset = () => {
    setId(null)
    setLift(null)
    setWeight(null)
    setReps(null)
    setRpe(null)
    setComp(true)
    setMemo('')
  }

  const ready = lift !== null && weight !== null && weight > 0 && reps !== null && rpe !== null
  const save = async () => {
    if (!ready) return
    await put('topSets', { id: id ?? newId(), date, lift, weight, reps, rpe, comp, memo: memo.trim() })
    toast(id ? 'セットを修正しました' : `${lift} を保存しました`)
    reset()
  }

  return (
    <>
      <div className="card stack">
        {id && <div className="sub">記録を修正中</div>}
        <DateField label="日付" value={date} onChange={(v) => v && setDate(v)} />
        <div>
          <span className="label">種目（トップセットのみ）</span>
          <Seg options={LIFTS} value={lift} onChange={pickLift} label="種目" />
        </div>
        <div>
          <span className="label">重量 kg</span>
          <Stepper label="重量" value={weight} onChange={setWeight} step={2.5} />
        </div>
        <div>
          <span className="label">回数</span>
          <Seg options={REPS} value={reps} onChange={setReps} label="回数" />
        </div>
        <div>
          <span className="label">RPE</span>
          <Seg options={RPES} value={rpe} onChange={setRpe} label="RPE" className="wrap5" />
        </div>
        <label className="toggle">
          <span>
            試合基準で挙げた
            <span className="muted" style={{ display: 'block' }}>
              SQの深さ・BPの静止・DLのダウンコール
            </span>
          </span>
          <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} />
        </label>
        <TextField label="メモ（任意）" value={memo} onChange={setMemo} placeholder="睡眠不足・疲労など" />
        <div className="row between">
          <span className="sub">推定1RM</span>
          <span className="num">
            <b>{ready ? f1(e1rm(weight, reps, rpe)) : '—'}</b> kg{ready && !comp && '（判定には使わない）'}
          </span>
        </div>
        <button type="button" className="btn primary" onClick={save} disabled={!ready}>
          {id ? '修正を保存' : '保存'}
        </button>
        {id && (
          <button type="button" className="btn" style={{ width: '100%' }} onClick={reset}>
            修正をやめる
          </button>
        )}
      </div>
      <Recent
        title="直近のセット"
        rows={data.topSets.slice(-10).reverse()}
        keyOf={(s) => s.id}
        table="topSets"
        toast={toast}
        onPick={(s) => {
          setId(s.id)
          setDate(s.date)
          setLift(s.lift)
          setWeight(s.weight)
          setReps(s.reps)
          setRpe(s.rpe)
          setComp(s.comp)
          setMemo(s.memo)
          window.scrollTo({ top: 0 })
        }}
        render={(s) => (
          <>
            {shortDate(s.date)}　<b>{s.lift}</b>　{s.weight}kg × {s.reps}　RPE{s.rpe}
            {!s.comp && '　×'}
            <span className="muted" style={{ display: 'block' }}>
              e1RM {f1(e1rm(s.weight, s.reps, s.rpe))}
            </span>
          </>
        )}
      />
    </>
  )
}

function WaistForm({ data, toast }: FormProps) {
  const [date, setDate] = useState(todayISO())
  const existing = data.waistLogs.find((l) => l.date === date)
  const last = data.waistLogs.filter((l) => l.date < date).at(-1)
  const [waistCm, setWaist] = useState<number | null>(null)
  useEffect(() => {
    setWaist(existing?.waistCm ?? last?.waistCm ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt])

  const doneThisWeek = data.waistLogs.some((l) => weekStart(l.date) === weekStart(todayISO()))
  const save = async () => {
    if (waistCm === null || waistCm <= 0) return
    await put('waistLogs', { date, waistCm })
    toast('ウエストを保存しました')
  }

  return (
    <>
      <div className="card stack">
        <div className="sub">
          へそ周り。週1回、同じ曜日・同じ時間帯に測る。{doneThisWeek ? '今週は入力済み。' : '今週はまだ入力がありません。'}
        </div>
        <DateField label="日付" value={date} onChange={(v) => v && setDate(v)} />
        <div>
          <span className="label">ウエスト周径 cm</span>
          <Stepper label="ウエスト" value={waistCm} onChange={setWaist} step={0.5} />
        </div>
        <button type="button" className="btn primary" onClick={save} disabled={waistCm === null || waistCm <= 0}>
          保存
        </button>
      </div>
      <Recent
        title="直近の記録"
        rows={data.waistLogs.slice(-6).reverse()}
        keyOf={(l) => l.date}
        table="waistLogs"
        onPick={(l) => setDate(l.date)}
        toast={toast}
        render={(l) => (
          <>
            {shortDate(l.date)}　<b>{f1(l.waistCm)}</b> cm
          </>
        )}
      />
    </>
  )
}

function CheckpointForm({ data, toast }: FormProps) {
  const [date, setDate] = useState(todayISO())
  const existing = data.checkpoints.find((c) => c.date === date)
  const [maxSQ, setSQ] = useState<number | null>(null)
  const [maxBP, setBP] = useState<number | null>(null)
  const [maxDL, setDL] = useState<number | null>(null)
  const [sleepHours, setSleep] = useState<number | null>(null)
  const [fatigue, setFatigue] = useState<number | null>(null)
  const [memo, setMemo] = useState('')
  useEffect(() => {
    setSQ(existing?.maxSQ ?? null)
    setBP(existing?.maxBP ?? null)
    setDL(existing?.maxDL ?? null)
    setSleep(existing?.sleepHours ?? null)
    setFatigue(existing?.fatigue ?? null)
    setMemo(existing?.memo ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt])

  const save = async () => {
    await put('checkpoints', { date, maxSQ, maxBP, maxDL, sleepHours, fatigue, memo: memo.trim() })
    toast('測定を保存しました')
  }

  return (
    <>
      <div className="card stack">
        <div className="sub">
          チェックポイント（11月末・1月末・2月末）の測定日に入力する。MAXを測る場合は、同じ曜日・同じ時間帯・試合基準の動作で。
          判定には直近2週の推定1RMを使い、ここの実測MAXは並べて表示する。
        </div>
        <DateField label="測定日" value={date} onChange={(v) => v && setDate(v)} />
        <div className="grid2">
          <NumField label="睡眠時間（時間）" value={sleepHours} onChange={setSleep} />
          <div>
            <span className="label">主観的な疲労度（1 軽い〜5 重い）</span>
            <Seg options={FATIGUE} value={fatigue} onChange={setFatigue} label="疲労度" />
          </div>
        </div>
        <div>
          <span className="label">実測MAX kg（測った種目だけ）</span>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <NumField label="SQ" value={maxSQ} onChange={setSQ} />
            <NumField label="BP" value={maxBP} onChange={setBP} />
            <NumField label="DL" value={maxDL} onChange={setDL} />
          </div>
        </div>
        <TextField label="メモ（任意）" value={memo} onChange={setMemo} />
        <button type="button" className="btn primary" onClick={save}>
          保存
        </button>
      </div>
      <Recent
        title="測定の記録"
        rows={[...data.checkpoints].reverse()}
        keyOf={(c) => c.date}
        table="checkpoints"
        onPick={(c) => setDate(c.date)}
        toast={toast}
        render={(c) => (
          <>
            {c.date}
            {c.maxSQ !== null && `　SQ ${c.maxSQ}`}
            {c.maxBP !== null && `　BP ${c.maxBP}`}
            {c.maxDL !== null && `　DL ${c.maxDL}`}
            {c.sleepHours !== null && `　睡眠${c.sleepHours}h`}
            {c.fatigue !== null && `　疲労${c.fatigue}`}
          </>
        )}
      />
    </>
  )
}
