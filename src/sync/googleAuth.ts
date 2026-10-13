// Google Identity Services でアクセストークンを取る。サーバーを持たないので更新トークンは無く、
// トークンは約1時間で切れる。切れたら画面操作をきっかけに取り直す。

const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** このアプリが作ったファイルだけを読み書きできる権限 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string
        scope: string
        callback: (r: TokenResponse) => void
        error_callback?: (e: { type: string; message?: string }) => void
      }): TokenClient
    }
  }
}
declare global {
  interface Window {
    google?: Gis
  }
}

let loading: Promise<void> | null = null
let token: { value: string; expiresAt: number } | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      s.remove()
      reject(new Error('Google のログイン部品を読み込めませんでした'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** 有効なトークンが手元にあれば返す（画面は出さない） */
export function cachedToken(): string | null {
  return token && token.expiresAt > Date.now() + 60_000 ? token.value : null
}

export function clearToken(): void {
  token = null
}

/**
 * トークンを取る。ポップアップが開くので、ボタンを押した処理の中から呼ぶこと。
 * 一度許可していれば、多くの場合ポップアップはすぐ閉じる。
 */
export async function requestToken(clientId: string): Promise<string> {
  const cached = cachedToken()
  if (cached) return cached
  await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = (window.google as Gis).accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description ?? r.error ?? 'Google の認証に失敗しました'))
          return
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => {
        reject(
          new Error(
            e.type === 'popup_failed_to_open'
              ? 'ポップアップがブロックされました。ブラウザの設定で許可してください'
              : e.type === 'popup_closed'
                ? 'ログインが中断されました'
                : (e.message ?? 'Google の認証に失敗しました'),
          ),
        )
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}
