import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { initSync } from './sync/syncEngine'
import { Home } from './ui/pages/Home'
import { Input } from './ui/pages/Input'
import { Plan } from './ui/pages/Plan'
import { Review } from './ui/pages/Review'
import { Settings } from './ui/pages/Settings'
import { Setup } from './ui/pages/Setup'
import { navigate, TAB_KEYS, useRoute, type TabKey } from './ui/route'
import { useData, useSetupDone } from './ui/useData'

const TAB_LABEL: Record<TabKey, string> = {
  home: 'ホーム',
  record: '記録',
  plan: '計画',
  review: '振り返り',
  settings: '設定',
}

const ICONS: Record<TabKey, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  record: <path d="M12 5v14M5 12h14" />,
  plan: <path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M8 13h3M8 16h6" />,
  review: <path d="M4 19V5M4 19h16M8 15l4-5 3 3 4-6" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4" />,
}

export function App() {
  const data = useData()
  const setupDone = useSetupDone()
  const route = useRoute()
  // 計画がまだ何も無い新しい端末では、最初に初回セットアップを出す
  const needsSetup =
    data !== undefined && setupDone === false && data.phases.length === 0 && data.cycles.length === 0
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

  const ready = data !== undefined && setupDone !== null && !needsSetup
  return (
    <>
      <main className="app">
        {data && needsSetup && <Setup data={data} toast={toast} />}
        {ready &&
          {
            home: <Home data={data} />,
            record: <Input key={route.sub ?? ''} data={data} toast={toast} sub={route.sub} />,
            plan: <Plan data={data} toast={toast} />,
            review: <Review data={data} toast={toast} sub={route.sub} id={route.id} />,
            settings: <Settings data={data} toast={toast} sub={route.sub} />,
          }[route.tab]}
      </main>
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
      {!needsSetup && (
        <nav className="tabs">
          {TAB_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={route.tab === t ? 'page' : undefined}
              onClick={() => navigate(t)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICONS[t]}
              </svg>
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}
