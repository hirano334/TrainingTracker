// Drive API v3 を fetch で直接呼ぶ

export const FILE_NAME = 'cycle-tracker-data.json'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new DriveError(res.status, `Drive API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res
}

/** このアプリが作ったデータファイルを探す。複数あれば最後に更新されたもの */
export async function findFile(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`)
  const res = await call(token, `${API}?q=${q}&orderBy=modifiedTime desc&fields=files(id)&spaces=drive`)
  const { files } = (await res.json()) as { files: { id: string }[] }
  return files[0]?.id ?? null
}

export async function createFile(token: string, content: string): Promise<string> {
  const boundary = `cycle-tracker-${Date.now()}`
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  const res = await call(token, `${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return ((await res.json()) as { id: string }).id
}

/** 版の識別子。書き込みの直前に、読んだ時点から変わっていないか確かめるのに使う */
export async function getRevision(token: string, fileId: string): Promise<string> {
  const res = await call(token, `${API}/${fileId}?fields=headRevisionId`)
  return ((await res.json()) as { headRevisionId: string }).headRevisionId
}

export async function readFile(token: string, fileId: string): Promise<string> {
  return (await call(token, `${API}/${fileId}?alt=media`)).text()
}

export async function updateFile(token: string, fileId: string, content: string): Promise<void> {
  await call(token, `${UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })
}
