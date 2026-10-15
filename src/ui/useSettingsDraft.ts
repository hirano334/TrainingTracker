import { useEffect, useState } from 'react'
import { put } from '../db/db'
import type { Settings } from '../domain/types'
import type { Data } from './useData'

/** 設定の一部を編集して、まとめて保存するための下書き */
export function useSettingsDraft(data: Data, toast: (m: string) => void) {
  const [d, setD] = useState<Settings>(data.settings)
  // 他の端末から同期で届いたら取り込む
  useEffect(() => setD(data.settings), [data.settings])
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD((p) => ({ ...p, [k]: v }))
  /** 必須の数値。空欄にされたら元の値のまま */
  const num = (k: keyof Settings) => (v: number | null) => {
    if (v !== null) setD((p) => ({ ...p, [k]: v }))
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(data.settings)
  const save = async (message = '保存しました') => {
    await put('settings', d)
    toast(message)
  }
  return { d, set, num, dirty, save }
}
