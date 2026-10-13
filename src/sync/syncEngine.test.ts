import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { put, readAll, remove, TrackerDB, writeNewer } from '../db/db'
import { DriveError } from './drive'
import { syncOnce, type SyncIO } from './syncEngine'

/** メモリ上の偽 Drive。ファイルは1つだけ */
class FakeDrive {
  content: string | null = null
  rev = 0
  writes = 0
  /** 次の読み込みの直後に、他の端末からの書き込みを割り込ませる */
  interleave: (() => Promise<void>) | null = null
}

let n = 0
function device(drive: FakeDrive) {
  const d = new TrackerDB(`sync-test-${n++}`)
  const io: SyncIO = {
    findFile: async () => (drive.content === null ? null : 'file'),
    createFile: async (_t, content) => {
      drive.content = content
      drive.rev++
      drive.writes++
      return 'file'
    },
    getRevision: async () => {
      if (drive.content === null) throw new DriveError(404, 'not found')
      return String(drive.rev)
    },
    readFile: async () => {
      const c = drive.content as string
      const f = drive.interleave
      drive.interleave = null
      if (f) await f()
      return c
    },
    updateFile: async (_t, _id, content) => {
      drive.content = content
      drive.rev++
      drive.writes++
    },
    readLocal: () => readAll(d),
    writeLocal: (data) => writeNewer(data, d),
  }
  return { d, sync: (known: string | null = null) => syncOnce('token', known, io) }
}

const log = (date: string, weight: number) => ({ date, weight, bodyFatPct: null, kcal: null, proteinG: null })
const weights = async (d: TrackerDB) =>
  Object.fromEntries((await readAll(d)).dailyLogs.map((l) => [l.date, l.deleted ? 'deleted' : l.weight]))
const tick = () => new Promise((r) => setTimeout(r, 3))

describe('syncOnce', () => {
  it('スマホで入力したものが PC に出る', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    const pc = device(drive)
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await phone.sync()
    await pc.sync()
    expect(await weights(pc.d)).toEqual({ '2026-12-01': 72.5 })
  })
  it('両方で別々に入力したものが両方に揃う', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    const pc = device(drive)
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await put('dailyLogs', log('2026-12-02', 72.8), pc.d)
    await phone.sync()
    await pc.sync()
    await phone.sync()
    const both = { '2026-12-01': 72.5, '2026-12-02': 72.8 }
    expect(await weights(phone.d)).toEqual(both)
    expect(await weights(pc.d)).toEqual(both)
  })
  it('片方で削除したものは復活しない', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    const pc = device(drive)
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await phone.sync()
    await pc.sync()
    await tick()
    await remove('dailyLogs', '2026-12-01', pc.d)
    await pc.sync()
    await phone.sync()
    await pc.sync()
    expect(await weights(phone.d)).toEqual({ '2026-12-01': 'deleted' })
    expect(await weights(pc.d)).toEqual({ '2026-12-01': 'deleted' })
  })
  it('変更が無ければ Drive に書かない', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await phone.sync()
    const before = drive.writes
    await phone.sync('file')
    expect(drive.writes).toBe(before)
  })
  it('読んだ後に他の端末が書いたら、読み直して両方の記録を残す', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    const pc = device(drive)
    await phone.sync()
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await put('dailyLogs', log('2026-12-02', 72.8), pc.d)
    drive.interleave = async () => {
      await pc.sync()
    }
    await phone.sync()
    expect(JSON.parse(drive.content as string).data.dailyLogs).toHaveLength(2)
    expect(await weights(phone.d)).toEqual({ '2026-12-01': 72.5, '2026-12-02': 72.8 })
  })
  it('Drive のファイルが消されていたら作り直す', async () => {
    const drive = new FakeDrive()
    const phone = device(drive)
    await put('dailyLogs', log('2026-12-01', 72.5), phone.d)
    await phone.sync()
    drive.content = null
    await phone.sync('file')
    expect(JSON.parse(drive.content as unknown as string).data.dailyLogs).toHaveLength(1)
  })
})
