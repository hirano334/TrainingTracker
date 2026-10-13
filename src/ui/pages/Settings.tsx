import { useEffect, useRef, useState } from 'react'
import { dailyLogsCSV, download, downloadBackup, importJSON, topSetsCSV } from '../../db/backup'
import { newId, put, remove, resetLocal, writeNewer } from '../../db/db'
import { checkpointTotals } from '../../domain/e1rm'
import { sampleData } from '../../domain/sample'
import type { Phase, PhaseKind, Settings as SettingsT } from '../../domain/types'
import { addDays, todayISO } from '../../domain/weeks'
import { avgWeightInWindow } from '../../domain/weight'
import { FILE_NAME } from '../../sync/drive'
import { disableSync, enableSync, getClientId, syncNow } from '../../sync/syncEngine'
import { DateField, NumField, TextField } from '../components/Fields'
import { ago, f1 } from '../format'
import { useMeta, useSyncState, type Data } from '../useData'

interface Props {
  data: Data
  toast: (msg: string) => void
}

export function Settings({ data, toast }: Props) {
  return (
    <>
      <div className="page-head">
        <h1>設定</h1>
      </div>
      <Params data={data} toast={toast} />
      <Phases data={data} toast={toast} />
      <DriveSync toast={toast} />
      <Backup data={data} toast={toast} />
    </>
  )
}

function Params({ data, toast }: Props) {
  const [d, setD] = useState<SettingsT>(data.settings)
  // 他の端末から同期で届いたら取り込む
  useEffect(() => setD(data.settings), [data.settings])
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setD((p) => ({ ...p, [k]: v }))
  /** 必須の数値。空欄にされたら元の値のまま */
  const num = (k: keyof SettingsT) => (v: number | null) => {
    if (v !== null) setD((p) => ({ ...p, [k]: v }))
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(data.settings)

  const measuredWeight = avgWeightInWindow(data.dailyLogs, d.baseDate)
  const measuredTotal = checkpointTotals(data.topSets, d.baseDate).total

  const save = async () => {
    await put('settings', d)
    toast('設定を保存しました')
  }

  return (
    <div className="card stack">
      <h2>パラメータ</h2>
      <div className="grid2">
        <NumField label="身長 cm" value={d.heightCm} onChange={num('heightCm')} />
        <DateField label="基準日" value={d.baseDate} onChange={(v) => v && set('baseDate', v)} />
      </div>
      <div>
        <NumField label="基準体重 kg（基準日の実測値で上書き）" value={d.baseWeight} onChange={num('baseWeight')} />
        {measuredWeight !== null && (
          <button type="button" className="link" onClick={() => set('baseWeight', Number(measuredWeight.toFixed(1)))}>
            基準日までの7日平均 {f1(measuredWeight)}kg を使う
          </button>
        )}
      </div>
      <div>
        <NumField
          label="基準トータル kg（基準日に測定）"
          value={d.baseTotal}
          onChange={(v) => set('baseTotal', v)}
          placeholder="未定"
        />
        {measuredTotal !== null && (
          <button type="button" className="link" onClick={() => set('baseTotal', Number(measuredTotal.toFixed(1)))}>
            基準日までの2週の推定1RM合計 {f1(measuredTotal)}kg を使う
          </button>
        )}
        <div className="muted">
          2月末の値は推定1RM（RPEからの計算値）なので、ここも同じ方法の値にすると比較が揃います。
          実測MAXの合計を入れると、推定1RMのほうが高く出やすいぶん伸びが大きく見えます。
        </div>
      </div>
      <div className="grid2">
        <NumField label="74kg級 標準 kg" value={d.standard74} onChange={num('standard74')} />
        <NumField label="83kg級 標準 kg" value={d.standard83} onChange={num('standard83')} />
        <DateField label="本命大会（仮）" value={d.mainMeetDate} onChange={(v) => set('mainMeetDate', v)} />
        <DateField label="春の大会" value={d.springMeetDate} onChange={(v) => set('springMeetDate', v)} />
        <NumField label="体脂肪率の上限 %" value={d.bodyFatLimitPct} onChange={num('bodyFatLimitPct')} />
        <NumField
          label="維持カロリー kcal"
          value={d.maintenanceKcal}
          onChange={(v) => set('maintenanceKcal', v)}
          placeholder="未定"
        />
      </div>
      <details>
        <summary>計算の係数・閾値</summary>
        <div className="grid2" style={{ marginTop: 8 }}>
          <NumField label="体重補正の指数" value={Number(d.allometricExponent.toFixed(4))} onChange={num('allometricExponent')} />
          <NumField label="必要ペースの係数" value={d.requiredPaceFactor} onChange={num('requiredPaceFactor')} />
          <NumField label="「境界」の下限（×必要ペース）" value={d.borderlineFactor} onChange={num('borderlineFactor')} />
          <NumField label="10月予測の倍率" value={d.projectionMultiplier} onChange={num('projectionMultiplier')} />
          <NumField label="落ち幅：正常の上限 kg" value={d.dropNormalMaxKg} onChange={num('dropNormalMaxKg')} />
          <NumField label="落ち幅：グレーの上限 kg" value={d.dropGreyMaxKg} onChange={num('dropGreyMaxKg')} />
          <NumField label="83kg級ルートの月数" value={d.route83Months} onChange={num('route83Months')} />
          <TextField
            label="83kg級の着地目標 kg"
            value={d.route83TargetsKg.join(', ')}
            onChange={(t) =>
              set(
                'route83TargetsKg',
                t
                  .split(/[,、\s]+/)
                  .map(Number)
                  .filter((n) => Number.isFinite(n) && n > 0),
              )
            }
          />
          <NumField label="増量ペース上限 kg/月" value={d.bulkPaceMaxPerMonth} onChange={num('bulkPaceMaxPerMonth')} />
          <NumField label="増量ペース下限 kg/月" value={d.bulkPaceMinPerMonth} onChange={num('bulkPaceMinPerMonth')} />
          <NumField label="減量ペース上限 kg/月" value={d.cutPaceMaxPerMonth} onChange={num('cutPaceMaxPerMonth')} />
          <NumField label="e1RM低下の警告 %" value={d.e1rmDropAlertPct} onChange={num('e1rmDropAlertPct')} />
        </div>
      </details>
      <button type="button" className="btn primary" onClick={save} disabled={!dirty}>
        {dirty ? 'パラメータを保存' : '保存済み'}
      </button>
    </div>
  )
}

const KINDS: { value: PhaseKind; label: string }[] = [
  { value: 'bulk', label: '増量' },
  { value: 'cut', label: '減量' },
  { value: 'checkpoint', label: '判定（目印）' },
]

function PhaseEditor({ phase, toast }: { phase: Phase; toast: (m: string) => void }) {
  const [d, setD] = useState(phase)
  useEffect(() => setD(phase), [phase])
  const set = <K extends keyof Phase>(k: K, v: Phase[K]) => setD((p) => ({ ...p, [k]: v }))
  const dirty = JSON.stringify(d) !== JSON.stringify(phase)
  const range =
    d.targetWeightMin !== null
      ? d.targetWeightMin === d.targetWeightMax || d.targetWeightMax === null
        ? `→ ${d.targetWeightMin}kg`
        : `→ ${d.targetWeightMin}〜${d.targetWeightMax}kg`
      : ''
  return (
    <details>
      <summary>
        <b style={{ color: 'var(--text)' }}>{phase.name}</b>　{phase.startDate ?? ''}〜{phase.endDate}　{range}
      </summary>
      <div className="stack" style={{ margin: '8px 0 16px' }}>
        <div className="grid2">
          <TextField label="名前" value={d.name} onChange={(v) => set('name', v)} />
          <label className="field">
            <span>種別</span>
            <select value={d.kind} onChange={(e) => set('kind', e.target.value as PhaseKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <DateField label="開始日" value={d.startDate} onChange={(v) => set('startDate', v)} />
          <DateField label="終了日" value={d.endDate} onChange={(v) => v && set('endDate', v)} />
        </div>
        {d.kind !== 'checkpoint' && (
          <>
            <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <NumField label="開始体重" value={d.startWeight} onChange={(v) => set('startWeight', v)} />
              <NumField label="目標（下限）" value={d.targetWeightMin} onChange={(v) => set('targetWeightMin', v)} />
              <NumField label="目標（上限）" value={d.targetWeightMax} onChange={(v) => set('targetWeightMax', v)} />
            </div>
            <div className="grid2">
              <NumField
                label="目標ペース kg/月（減量は負）"
                value={d.targetPacePerMonth}
                onChange={(v) => set('targetPacePerMonth', v)}
              />
              <TextField label="ペースの表示" value={d.paceNote} onChange={(v) => set('paceNote', v)} />
              <NumField label="カロリー：維持との差（小）" value={d.kcalOffsetMin} onChange={(v) => set('kcalOffsetMin', v)} />
              <NumField label="カロリー：維持との差（大）" value={d.kcalOffsetMax} onChange={(v) => set('kcalOffsetMax', v)} />
            </div>
          </>
        )}
        <div className="row">
          <button
            type="button"
            className="btn grow"
            disabled={!dirty || d.name.trim() === '' || (d.startDate !== null && d.startDate > d.endDate)}
            onClick={async () => {
              await put('phases', d)
              toast('フェーズを保存しました')
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm(`「${phase.name}」を削除しますか？`)) return
              await remove('phases', phase.id)
              toast('フェーズを削除しました')
            }}
          >
            削除
          </button>
        </div>
      </div>
    </details>
  )
}

function Phases({ data, toast }: Props) {
  const add = async () => {
    const last = data.phases.filter((p) => p.kind !== 'checkpoint').at(-1)
    const start = last ? addDays(last.endDate, 1) : todayISO()
    const from = last ? (last.targetWeightMax ?? last.targetWeightMin) : null
    await put('phases', {
      id: newId(),
      name: '新しいフェーズ',
      kind: last?.kind === 'bulk' ? 'cut' : 'bulk',
      startDate: start,
      endDate: addDays(start, 29),
      startWeight: from,
      targetWeightMin: from,
      targetWeightMax: from,
      targetPacePerMonth: null,
      paceNote: '',
      kcalOffsetMin: null,
      kcalOffsetMax: null,
    })
    toast('フェーズを追加しました。内容を編集してください')
  }
  return (
    <div className="card">
      <h2>フェーズ表</h2>
      <div className="muted">行を足せば第2サイクル以降も同じ計算で動きます。判定パネルは基準日より後の最初の「増量 → 減量」を使います。</div>
      {data.phases.map((p) => (
        <PhaseEditor key={p.id} phase={p} toast={toast} />
      ))}
      <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} onClick={add}>
        ＋ フェーズを追加
      </button>
    </div>
  )
}

function DriveSync({ toast }: { toast: (m: string) => void }) {
  const sync = useSyncState()
  const [clientId, setClientId] = useState('')
  useEffect(() => {
    void getClientId().then(setClientId)
  }, [])
  const on = sync.status !== 'off'
  return (
    <div className="card stack">
      <h2>Google Drive と同期</h2>
      {on ? (
        <>
          <div className="sub">
            Drive の「{FILE_NAME}」と同期しています。最終同期：{ago(sync.lastSyncAt)}
            {sync.status === 'needsAuth' && '（ログインの有効期限切れ。「今すぐ同期」を押してください）'}
            {sync.status === 'offline' && '（オフライン）'}
            {sync.error && <div style={{ color: 'var(--critical)' }}>{sync.error}</div>}
          </div>
          <div className="row">
            <button type="button" className="btn grow" disabled={sync.status === 'syncing'} onClick={() => void syncNow(true)}>
              {sync.status === 'syncing' ? '同期中…' : '今すぐ同期'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await disableSync()
                toast('同期を止めました')
              }}
            >
              同期を止める
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sub">
            スマホと PC で同じ記録を使えるようにします。Google Cloud で発行した OAuth クライアント ID が必要です（手順は
            docs/google-drive-setup.md）。
          </div>
          <TextField
            label="OAuth クライアント ID"
            value={clientId}
            onChange={setClientId}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
          />
          <button
            type="button"
            className="btn"
            style={{ width: '100%' }}
            disabled={clientId.trim() === ''}
            onClick={() => void enableSync(clientId)}
          >
            Google でログインして同期を始める
          </button>
        </>
      )}
    </div>
  )
}

function Backup({ data, toast }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const lastBackupAt = useMeta<number>('lastBackupAt')
  return (
    <div className="card stack">
      <h2>バックアップ</h2>
      <div className="sub">最終バックアップ：{ago(lastBackupAt)}</div>
      <div className="grid2">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await downloadBackup()
            toast('バックアップを書き出しました')
          }}
        >
          書き出し（JSON）
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          読み込み
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => download(`weight-${todayISO()}.csv`, dailyLogsCSV(data.dailyLogs), 'text/csv')}
        >
          体重 CSV
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => download(`topsets-${todayISO()}.csv`, topSetsCSV(data.topSets), 'text/csv')}
        >
          トレ CSV
        </button>
      </div>
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
            toast('バックアップを読み込みました')
          } catch (err) {
            alert(`読み込めませんでした：${(err as Error).message}`)
          }
        }}
      />
      <div className="muted">読み込みは、同じ記録が両方にある場合に新しい方を残します。</div>
      {import.meta.env.DEV && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await writeNewer(sampleData())
            toast('サンプルデータを入れました')
          }}
        >
          （開発用）サンプルデータを入れる
        </button>
      )}
      <button
        type="button"
        className="btn danger"
        onClick={async () => {
          if (!confirm('この端末の記録をすべて消して初期状態に戻します。Drive 上のファイルは消えません。よろしいですか？')) return
          await disableSync()
          await resetLocal()
          toast('この端末の記録を消しました')
        }}
      >
        この端末の記録を全消去
      </button>
    </div>
  )
}
