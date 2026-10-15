import { useEffect, useState } from 'react'
import type { ShowFlags } from '../../domain/types'
import { FILE_NAME } from '../../sync/drive'
import { disableSync, enableSync, getClientId, syncNow } from '../../sync/syncEngine'
import { NumField, TextField } from '../components/Fields'
import { ago } from '../format'
import { goBack, navigate } from '../route'
import { useSyncState, type Data } from '../useData'
import { useSettingsDraft } from '../useSettingsDraft'
import { FormulaCard } from './SettingsCalc'
import { DataPage, DevicePage } from './SettingsData'

export interface SettingsProps {
  data: Data
  toast: (msg: string) => void
}
type Props = SettingsProps

/** 設定の項目。一覧に並べ、押すとそのページを開く */
const PAGES = [
  { key: 'items', title: '記録する項目', lead: 'ウエスト・体脂肪率・カロリー・測定・心拍数を使うかどうか' },
  { key: 'formula', title: '推定1RMの式', lead: '重量・回数・RPE から1RMを推定する式' },
  { key: 'criteria', title: '判定と警告の基準', lead: '落ち幅の閾値、ペース警告の幅、体重補正の指数など' },
  { key: 'data', title: 'データの書き出し・読み込み', lead: 'バックアップ、CSV、計算結果の書き出し' },
  { key: 'sync', title: 'Google Drive と同期', lead: 'スマホと PC で同じ記録を使う' },
  { key: 'device', title: 'この端末', lead: 'この端末の記録の全消去' },
] as const
type PageKey = (typeof PAGES)[number]['key']

export function Settings({ data, toast, sub }: Props & { sub: string | null }) {
  const page = PAGES.find((p) => p.key === sub)
  if (!page) return <Menu data={data} />
  return (
    <>
      <div className="page-head">
        <button type="button" className="back" onClick={() => goBack(() => navigate('settings'))}>
          ← 設定
        </button>
      </div>
      <h1 style={{ marginBottom: 12 }}>{page.title}</h1>
      <Page k={page.key} data={data} toast={toast} />
    </>
  )
}

function Page({ k, data, toast }: Props & { k: PageKey }) {
  switch (k) {
    case 'items':
      return <ItemsPage data={data} toast={toast} />
    case 'formula':
      return <FormulaCard data={data} toast={toast} />
    case 'criteria':
      return <CriteriaPage data={data} toast={toast} />
    case 'data':
      return <DataPage data={data} toast={toast} />
    case 'sync':
      return <DriveSync toast={toast} />
    case 'device':
      return <DevicePage toast={toast} />
  }
}

function Menu({ data }: { data: Data }) {
  const sync = useSyncState()
  // 一覧の右側に、今の状態を短く出す
  const status: Partial<Record<PageKey, string>> = {
    formula: data.formula.formula.name,
    items: (['waist', 'bodyFat', 'nutrition', 'checkpoint', 'heartRate'] as const)
      .filter((k) => data.settings.show[k])
      .length.toString() + ' 項目',
    sync: sync.status === 'off' ? 'オフ' : `同期 ${ago(sync.lastSyncAt)}`,
  }
  return (
    <>
      <div className="page-head">
        <h1>設定</h1>
      </div>
      <div className="card menu">
        {PAGES.map((p) => (
          <button key={p.key} type="button" onClick={() => navigate('settings', p.key)}>
            <span className="grow">
              <b>{p.title}</b>
              <span className="muted" style={{ display: 'block' }}>
                {p.lead}
              </span>
            </span>
            {status[p.key] && <span className="sub">{status[p.key]}</span>}
            <span className="chev" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>
      <div className="muted">目標・フェーズ・サイクルは「計画」タブにあります。</div>
    </>
  )
}

const SHOW_LABELS: [keyof ShowFlags, string, string][] = [
  ['waist', 'ウエスト周径', '週1回の測定'],
  ['bodyFat', '体脂肪率', '体重計の表示値と、上限超過の警告'],
  ['nutrition', 'カロリー・タンパク質', '摂取量の記録、維持カロリー、カロリーの目安'],
  ['checkpoint', 'チェックポイント測定', '実測MAX・睡眠時間・疲労度'],
  ['heartRate', '睡眠時平均心拍数', '毎朝の入力とグラフ。判定や警告には使わない'],
]

/** 設定 > 記録する項目。切り替えたらすぐ保存する */
function ItemsPage({ data, toast }: Props) {
  const { d, set, dirty, save } = useSettingsDraft(data, toast)
  useEffect(() => {
    if (dirty) void save('記録する項目を変更しました')
    // 切り替えのたびに保存する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.show])
  return (
    <div className="card">
      <div className="muted">体重とトップセットは必ず記録します。オフにすると入力欄と関連する表示を隠します。入力済みの記録は消えません。</div>
      {SHOW_LABELS.map(([key, label, hint]) => (
        <label className="toggle" key={key}>
          <span>
            {label}
            <span className="muted" style={{ display: 'block' }}>
              {hint}
            </span>
          </span>
          <input type="checkbox" checked={d.show[key]} onChange={(e) => set('show', { ...d.show, [key]: e.target.checked })} />
        </label>
      ))}
    </div>
  )
}

/** 設定 > 判定と警告の基準 */
function CriteriaPage({ data, toast }: Props) {
  const { d, num, dirty, save } = useSettingsDraft(data, toast)
  return (
    <>
      <div className="card stack">
        <h2>サイクルの判定</h2>
        <div className="grid2">
          <NumField label="落ち幅：正常の上限 %" value={Number(d.dropNormalMaxPct.toFixed(2))} onChange={num('dropNormalMaxPct')} />
          <NumField label="落ち幅：グレーの上限 %" value={Number(d.dropGreyMaxPct.toFixed(2))} onChange={num('dropGreyMaxPct')} />
          <NumField label="「境界」の下限（×必要な伸び）" value={d.borderlineFactor} onChange={num('borderlineFactor')} />
          <NumField label="体重補正の指数" value={Number(d.allometricExponent.toFixed(4))} onChange={num('allometricExponent')} />
        </div>
        <div className="muted">
          落ち幅は、減量前の推定トータルに対する割合。体重補正は「トータル × (基準体重 ÷ 体重)^指数」。必要な伸びの係数と予測の倍率は、計画タブのサイクルごとに設定します。
        </div>
      </div>
      <div className="card stack">
        <h2>警告</h2>
        <div className="grid2">
          <NumField label="ペースの警告の幅（計画±）kg/月" value={d.paceToleranceKgPerMonth} onChange={num('paceToleranceKgPerMonth')} />
          <NumField label="推定1RMの低下の警告 %" value={d.e1rmDropAlertPct} onChange={num('e1rmDropAlertPct')} />
          {d.show.bodyFat && <NumField label="体脂肪率の上限 %" value={d.bodyFatLimitPct} onChange={num('bodyFatLimitPct')} />}
        </div>
      </div>
      {d.show.nutrition && (
        <div className="card stack">
          <h2>カロリー</h2>
          <NumField label="体重1kgあたりのエネルギー kcal" value={d.kcalPerKg} onChange={num('kcalPerKg')} />
          <div className="muted">フェーズのカロリーの目安と、維持カロリーの推定に使います。</div>
        </div>
      )}
      <button type="button" className="btn primary" onClick={() => void save('基準を保存しました')} disabled={!dirty}>
        {dirty ? '保存' : '保存済み'}
      </button>
    </>
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
