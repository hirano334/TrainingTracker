import { useEffect, useSyncExternalStore } from 'react'

// 画面の位置を URL の # 以降で持つ（例：#/settings/data、#/review/report/<サイクルID>）。
// Android の戻るボタンやブラウザの戻るで、1つ前の画面に戻れるようにするため。

export const TAB_KEYS = ['home', 'record', 'plan', 'review', 'settings'] as const
export type TabKey = (typeof TAB_KEYS)[number]

export interface Route {
  tab: TabKey
  /** タブの中のページ（例：settings の data） */
  sub: string | null
  /** ページが対象にするもの（例：レポートのサイクルID） */
  id: string | null
}

export function parseRoute(hash: string): Route {
  const [tab, sub, id] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return {
    tab: (TAB_KEYS as readonly string[]).includes(tab) ? (tab as TabKey) : 'home',
    sub: sub || null,
    id: id || null,
  }
}

export function routePath(tab: TabKey, sub?: string | null, id?: string | null): string {
  return '#/' + [tab, sub, id].filter((x): x is string => !!x).map(encodeURIComponent).join('/')
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}
const getHash = () => window.location.hash

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash)
  // 画面が変わったら一番上から見せる
  // （scrollTo は新しいブラウザでは Promise を返すので、effect の戻り値にしない）
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [hash])
  return parseRoute(hash)
}

/**
 * 画面を移る。replace は履歴を残さない（タブの中の切り替えなど、戻るで1つずつ戻ってほしくないもの）
 */
export function navigate(tab: TabKey, sub?: string | null, id?: string | null, replace = false): void {
  const next = routePath(tab, sub, id)
  if (next === window.location.hash) return
  if (replace) window.location.replace(next)
  else window.location.hash = next
}

/** 戻る。履歴が無ければ（直接開いた場合など）指定の画面へ */
export function goBack(fallback: () => void): void {
  if (window.history.length > 1) window.history.back()
  else fallback()
}
