import { useMemo, useRef, useState } from 'react'
import { importJSON } from '../../db/backup'
import { put, putMany, setMeta, SETUP_DONE } from '../../db/db'
import { buildSetup } from '../../domain/setup'
import type { ShowFlags } from '../../domain/types'
import { shortDate, todayISO } from '../../domain/weeks'
import { DateField, NumField, TextField } from '../components/Fields'
import { Stepper } from '../components/Stepper'
import { f1 } from '../format'
import type { Data } from '../useData'

const SHOW_LABELS: [keyof ShowFlags, string][] = [
  ['waist', 'ウエスト周径'],
  ['bodyFat', '体脂肪率'],
  ['nutrition', 'カロリー・タンパク質'],
  ['checkpoint', 'チェックポイント測定（実測MAXなど）'],
  ['heartRate', '睡眠時平均心拍数'],
]

const parseList = (t: string) =>
  t
    .split(/[,、\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

/** 初めて開いたときに、その人の体重・目標・日程を聞いてフェーズ表とサイクルを作る */
export function Setup({ data, toast }: { data: Data; toast: (m: string) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [weight, setWeight] = useState<number | null>(null)
  const [goalTotal, setGoal] = useState<number | null>(null)
  const [baseTotal, setBaseTotal] = useState<number | null>(null)
  const [mainMeetDate, setMeet] = useState<string | null>(null)
  const [classChoice, setClassChoice] = useState(false)
  const [lowerClassName, setLower] = useState('')
  const [upperClassName, setUpper] = useState('')
  const [upperClassStandard, setUpperStd] = useState<number | null>(null)
  const [landing, setLanding] = useState('')
  const [baseDate, setBaseDate] = useState(todayISO())
  const [bulkWeeks, setBulkWeeks] = useState<number | null>(8)
  const [cutWeeks, setCutWeeks] = useState<number | null>(4)
  const [bulkPerMonth, setBulkPace] = useState<number | null>(1.5)
  const [cutPerMonth, setCutPace] = useState<number | null>(1.5)
  const [show, setShow] = useState<ShowFlags>(data.settings.show)

  const missing = [
    (weight === null || weight <= 0) && 'いまの体重',
    (goalTotal === null || goalTotal <= 0) && '目標トータル',
    classChoice && (lowerClassName.trim() === '' || upperClassName.trim() === '') && '階級の名前',
    (!bulkWeeks || bulkWeeks < 1 || !cutWeeks || cutWeeks < 1) && '増量・減量の週数',
    (!bulkPerMonth || bulkPerMonth <= 0 || !cutPerMonth || cutPerMonth <= 0) && '増量・減量のペース',
  ].filter((x): x is string => typeof x === 'string')

  const plan = useMemo(
    () =>
      missing.length > 0
        ? null
        : buildSetup({
            weight: weight as number,
            goalTotal: goalTotal as number,
            baseTotal,
            mainMeetDate,
            classChoice,
            lowerClassName: lowerClassName.trim(),
            upperClassName: upperClassName.trim(),
            upperClassStandard,
            upperLandingTargetsKg: parseList(landing),
            baseDate,
            bulkWeeks: bulkWeeks as number,
            cutWeeks: cutWeeks as number,
            bulkPerMonth: bulkPerMonth as number,
            cutPerMonth: cutPerMonth as number,
            show,
          }),
    // missing は下の値から決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weight, goalTotal, baseTotal, mainMeetDate, classChoice, lowerClassName, upperClassName, upperClassStandard, landing, baseDate, bulkWeeks, cutWeeks, bulkPerMonth, cutPerMonth, show],
  )

  const start = async () => {
    if (!plan) return
    await put('settings', { ...data.settings, ...plan.settings })
    await putMany('phases', plan.phases)
    await put('cycles', plan.cycle)
    await setMeta(SETUP_DONE, true)
    toast('設定を作りました。あとから設定画面で変えられます')
  }

  return (
    <>
      <div className="page-head">
        <h1>はじめに</h1>
      </div>
      <div className="card sub">
        増量と減量を1サイクルとして、体重と SQ・BP・DL のトップセットを記録し、目標トータルに届くペースかを判定するアプリです。
        最初の計画を作るために、いくつか教えてください。あとから設定画面で全部変えられます。
      </div>

      <div className="card stack">
        <h2>あなたのこと</h2>
        <div>
          <span className="label">いまの体重 kg</span>
          <Stepper label="いまの体重" value={weight} onChange={setWeight} step={0.1} />
        </div>
        <div>
          <NumField label="目標トータル kg（出たい大会の標準記録など）" value={goalTotal} onChange={setGoal} />
        </div>
        <div>
          <NumField label="いまのトータル kg（分かれば）" value={baseTotal} onChange={setBaseTotal} placeholder="あとで入れる" />
          <div className="muted">
            空欄でも始められます。2週間ほど記録すると、設定のサイクルで記録から計算した値を入れられます。
          </div>
        </div>
        <DateField label="本命大会の日付（分かれば）" value={mainMeetDate} onChange={setMeet} />
      </div>

      <div className="card stack">
        <label className="toggle">
          <span>
            階級を迷っている
            <span className="muted" style={{ display: 'block' }}>
              いまの階級に残るか、上の階級に上げるかも判定する
            </span>
          </span>
          <input type="checkbox" checked={classChoice} onChange={(e) => setClassChoice(e.target.checked)} />
        </label>
        {classChoice && (
          <>
            <div className="grid2">
              <TextField label="いまの階級" value={lowerClassName} onChange={setLower} placeholder="74kg級" />
              <TextField label="上の階級" value={upperClassName} onChange={setUpper} placeholder="83kg級" />
              <NumField label="上の階級の標準記録 kg" value={upperClassStandard} onChange={setUpperStd} placeholder="任意" />
              <TextField label="上げる場合の着地目標 kg" value={landing} onChange={setLanding} placeholder="81, 82" />
            </div>
            <div className="muted">目標トータルには、いまの階級の標準記録を入れてください。</div>
          </>
        )}
      </div>

      <div className="card stack">
        <h2>最初のサイクル</h2>
        <DateField label="基準日（この翌日から増量）" value={baseDate} onChange={(v) => v && setBaseDate(v)} />
        <div className="grid2">
          <NumField label="増量 週数" value={bulkWeeks} onChange={setBulkWeeks} />
          <NumField label="増量ペース kg/月" value={bulkPerMonth} onChange={setBulkPace} />
          <NumField label="減量 週数" value={cutWeeks} onChange={setCutWeeks} />
          <NumField label="減量ペース kg/月" value={cutPerMonth} onChange={setCutPace} />
        </div>
        {plan && (
          <table className="kv">
            <tbody>
              {plan.phases.map((p) => (
                <tr key={p.id}>
                  <th>
                    {p.name}
                    <div className="muted">
                      {shortDate(p.startDate as string)}〜{shortDate(p.endDate)}
                    </div>
                  </th>
                  <td>
                    {f1(p.startWeight)} → {f1(p.targetWeightMin)} kg
                  </td>
                </tr>
              ))}
              <tr>
                <th>
                  必要ペースの係数 / 予測の倍率
                  <div className="muted">{mainMeetDate ? '本命大会までのサイクル数から計算' : '大会日が無いので既定値'}</div>
                </th>
                <td>
                  {plan.cycle.requiredPaceFactor} / {plan.cycle.projectionMultiplier}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>記録する項目</h2>
        <div className="muted">体重とトップセットは必ず記録します。それ以外は選べます。</div>
        {SHOW_LABELS.map(([key, label]) => (
          <label className="toggle" key={key}>
            <span>{label}</span>
            <input type="checkbox" checked={show[key]} onChange={(e) => setShow({ ...show, [key]: e.target.checked })} />
          </label>
        ))}
      </div>

      {missing.length > 0 && <div className="sub" style={{ marginBottom: 8 }}>未入力：{missing.join('、')}</div>}
      <button type="button" className="btn primary" disabled={!plan} onClick={() => void start()}>
        この内容で始める
      </button>

      <div className="card stack" style={{ marginTop: 16 }}>
        <div className="sub">すでに別の端末で使っている場合は、計画を作らずに記録を持ってきてください。</div>
        <button type="button" className="btn" style={{ width: '100%' }} onClick={() => file.current?.click()}>
          バックアップ（JSON）を読み込む
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              await importJSON(await f.text())
              await setMeta(SETUP_DONE, true)
              toast('バックアップを読み込みました')
            } catch (err) {
              alert(`読み込めませんでした：${(err as Error).message}`)
            }
          }}
        />
        <button type="button" className="btn" style={{ width: '100%' }} onClick={() => void setMeta(SETUP_DONE, true)}>
          スキップ（設定画面で自分で入れる／Drive と同期する）
        </button>
      </div>
    </>
  )
}
