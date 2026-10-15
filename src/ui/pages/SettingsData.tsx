import { useRef, useState } from 'react'
import { csv, dailyLogsCSV, download, downloadBackup, importJSON, topSetsCSV } from '../../db/backup'
import { applyImport, parseImport, type ParsedImport } from '../../db/csvImport'
import { putMany, resetLocal, writeNewer } from '../../db/db'
import { EXAMPLE_CYCLES, EXAMPLE_PHASES, EXAMPLE_SETTINGS } from '../../domain/example'
import { buildResults, weeklyTable } from '../../domain/report'
import { sampleData } from '../../domain/sample'
import { todayISO } from '../../domain/weeks'
import { disableSync } from '../../sync/syncEngine'
import { ago } from '../format'
import { useMeta } from '../useData'
import type { SettingsProps } from './Settings'

const KIND_LABEL = { dailyLogs: '体重の記録', topSets: 'トップセットの記録' } as const

/** CSV の取り込み。読んだ内容を見せて、確認してから書き込む */
function CsvImport({ toast }: { toast: (m: string) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ name: string; parsed: ParsedImport } | null>(null)
  const [overwrite, setOverwrite] = useState(false)

  return (
    <>
      <button type="button" className="btn" style={{ width: '100%' }} onClick={() => file.current?.click()}>
        CSV を取り込む（過去の記録）
      </button>
      <input
        ref={file}
        type="file"
        accept="text/csv,.csv,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            setOverwrite(false)
            setPending({ name: f.name, parsed: parseImport(await f.text()) })
          } catch (err) {
            alert(`読み込めませんでした：${(err as Error).message}`)
          }
        }}
      />
      {pending && (
        <div className="stack" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div>
            <b>{pending.name}</b>
            <div className="sub">
              {KIND_LABEL[pending.parsed.kind]}：{pending.parsed.rows.length}件を読み取り
              {pending.parsed.errors.length > 0 && `、${pending.parsed.errors.length}行は読めませんでした`}
            </div>
          </div>
          {pending.parsed.errors.length > 0 && (
            <ul className="list sub">
              {pending.parsed.errors.slice(0, 8).map((x) => (
                <li key={x.line}>
                  {x.line}行目：{x.reason}
                </li>
              ))}
              {pending.parsed.errors.length > 8 && <li>ほか {pending.parsed.errors.length - 8} 行</li>}
            </ul>
          )}
          {pending.parsed.kind === 'dailyLogs' && (
            <label className="toggle">
              <span>既に記録のある日も上書きする</span>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            </label>
          )}
          <div className="row">
            <button
              type="button"
              className="btn grow"
              disabled={pending.parsed.rows.length === 0}
              onClick={async () => {
                const r = await applyImport(pending.parsed, overwrite)
                setPending(null)
                toast(`${r.added}件を取り込みました${r.skipped > 0 ? `（${r.skipped}件は記録済み）` : ''}`)
              }}
            >
              取り込む
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>CSV の書式</summary>
        <div className="muted" style={{ marginTop: 4 }}>
          1行目は見出し。このアプリが書き出す CSV はそのまま読めます。
          <br />
          体重：<code>date, weight, bodyfat, kcal, protein, hr</code>（date と weight が必須）
          <br />
          トップセット：<code>date, lift, weight, reps, rpe, comp, memo</code>（lift は SQ / BP / DL、reps は1〜5、rpe
          は6〜10、comp は ○ か ×。空欄は ○）
          <br />
          日付は 2026-12-01 または 2026/12/1。同じファイルを2回取り込んでも重複しません。
        </div>
      </details>
    </>
  )
}

/** 設定 > データの書き出し・読み込み */
export function DataPage({ data, toast }: SettingsProps) {
  const file = useRef<HTMLInputElement>(null)
  const lastBackupAt = useMeta<number>('lastBackupAt')
  const today = todayISO()

  return (
    <>
      <div className="card stack">
        <h2>記録のバックアップ</h2>
        <div className="muted">入力した記録と設定をまとめて保存します。機種変更や、別の端末への移し替えに使います。</div>
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
            読み込み（JSON）
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download(`weight-${today}.csv`, dailyLogsCSV(data.dailyLogs), 'text/csv')}
          >
            体重 CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download(`topsets-${today}.csv`, topSetsCSV(data.topSets), 'text/csv')}
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
        <div className="muted">JSON の読み込みは、同じ記録が両方にある場合に新しい方を残します。</div>
        <CsvImport toast={toast} />
      </div>

      <div className="card stack">
        <h2>計算結果の書き出し</h2>
        <div className="sub">
          週ごとの値・判定・アラート・自己ベストと、計算に使った式（{data.formula.formula.name}）や設定をまとめて書き出します。
        </div>
        <div className="grid2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              download(`results-${today}.json`, JSON.stringify(buildResults(data, today), null, 2), 'application/json')
            }
          >
            結果 JSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const t = weeklyTable(buildResults(data, today).weekly)
              download(`results-weekly-${today}.csv`, csv(t.header, t.rows), 'text/csv')
            }}
          >
            週次の表 CSV
          </button>
        </div>
        <div className="muted">結果のファイルは記録の代わりにはなりません（読み込みには使えません）。</div>
      </div>

    </>
  )
}

/** 設定 > この端末 */
export function DevicePage({ toast }: Pick<SettingsProps, 'toast'>) {
  return (
    <div className="card stack">
        {import.meta.env.DEV && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              // 要件定義どおりの設定例と、それに合わせた3ヶ月半ぶんの記録
              await putMany('settings', [EXAMPLE_SETTINGS])
              await putMany('phases', EXAMPLE_PHASES)
              await putMany('cycles', EXAMPLE_CYCLES)
              await writeNewer(sampleData())
              toast('サンプルデータを入れました')
            }}
          >
            （開発用）設定例とサンプルデータを入れる
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
