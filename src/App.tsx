import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { initSync } from './sync/syncEngine'
import { Charts } from './ui/pages/Charts'
import { Home } from './ui/pages/Home'
import { Input } from './ui/pages/Input'
import { Judgement } from './ui/pages/Judgement'
import { Report } from './ui/pages/Report'
import { Settings } from './ui/pages/Settings'
import { useData } from './ui/useData'

const TABS = ['ホーム', '入力', 'グラフ', '判定', '設定'] as const
type Tab = (typeof TABS)[number]

const ICONS: Record<Tab, ReactNode> = {
  ホーム: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  入力: <path d="M12 5v14M5 12h14" />,
  グラフ: <path d="M4 19V5M4 19h16M8 15l4-5 3 3 4-6" />,
  判定: <path d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" />,
  設定: (
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4" />
  ),
}

export function App() {
  const data = useData()
  const [tab, setTab] = useState<Tab>('ホーム')
  /** 開いている判定レポートのサイクル */
  const [report, setReport] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const toast = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 1800)
  }, [])

  useEffect(() => {
    void initSync()
    // ブラウザが空き容量確保のために記録を消さないよう頼む
    void navigator.storage?.persist?.()
  }, [])

  return (
    <>
      <main className="app">
        {data && report !== null && <Report data={data} cycleId={report} close={() => setReport(null)} />}
        {data &&
          report === null &&
          {
            ホーム: <Home data={data} />,
            入力: <Input data={data} toast={toast} />,
            グラフ: <Charts data={data} />,
            判定: (
              <Judgement
                data={data}
                openReport={(id) => {
                  setReport(id)
                  window.scrollTo({ top: 0 })
                }}
              />
            ),
            設定: <Settings data={data} toast={toast} />,
          }[tab]}
      </main>
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t && report === null ? 'page' : undefined}
            onClick={() => {
              setReport(null)
              setTab(t)
              window.scrollTo({ top: 0 })
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[t]}
            </svg>
            {t}
          </button>
        ))}
      </nav>
    </>
  )
}
