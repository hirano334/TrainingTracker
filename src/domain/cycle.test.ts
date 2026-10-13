import { describe, expect, it } from 'vitest'
import { normalizeCycle, resolveCycle, resolveCycles, type ResolvedCycle } from './cycles'
import { DEFAULT_SETTINGS, normalizeSettings } from './defaults'
import { EXAMPLE_CYCLES, EXAMPLE_PHASES, EXAMPLE_SETTINGS } from './example'
import { rtsFraction } from './expr'
import { BUILTIN_FORMULAS, compileFormula, epley, resolveFormula, validateFormula } from './formulas'
import { judge } from './judgement'
import { sampleData } from './sample'
import { summarizeCycle } from './summary'
import type { Checkpoint, Cycle, Phase } from './types'

const S = EXAMPLE_SETTINGS
const d = { ...sampleData(), checkpoints: [] as Checkpoint[] }
const cycle = (patch: Partial<Cycle> = {}) => ({ ...EXAMPLE_CYCLES[0], baseTotal: 470, ...patch })
const resolved = (patch: Partial<Cycle> = {}, phases: Phase[] = EXAMPLE_PHASES) =>
  resolveCycle(cycle(patch), phases) as ResolvedCycle

describe('RTS の表', () => {
  const rts = compileFormula(BUILTIN_FORMULAS.find((f) => f.id === 'rts')!.expr)
  it('表の値', () => {
    expect([1, 1.5, 2, 3, 4, 5, 9].map(rtsFraction)).toEqual([1, 0.978, 0.955, 0.922, 0.892, 0.863, 0.762])
  })
  it('あいだは直線でつなぎ、表の外は端の値', () => {
    expect(rtsFraction(1.25)).toBeCloseTo(0.989)
    expect(rtsFraction(0)).toBe(1)
    expect(rtsFraction(99)).toBe(0.68)
  })
  it('1回・RPE10 は実重量。回数 + 残り回数が同じなら同じ値', () => {
    expect(rts(160, 1, 10)).toBe(160)
    expect(rts(160, 1, 9.5)).toBeCloseTo(163.6, 1)
    expect(rts(160, 2, 10)).toBeCloseTo(167.5, 1)
    expect(rts(160, 1, 9)).toBeCloseTo(rts(160, 2, 10))
    expect(rts(160, 3, 10)).toBeCloseTo(173.5, 1)
    expect(rts(160, 3, 8)).toBeCloseTo(185.4, 1)
  })
  it('1回3%の式', () => {
    const e3 = compileFormula(BUILTIN_FORMULAS.find((f) => f.id === 'epley3')!.expr)
    expect(e3(160, 3, 9)).toBeCloseTo(160 * 1.12)
  })
  it('組み込みの式はすべて検証を通る', () => {
    for (const f of BUILTIN_FORMULAS) expect(validateFormula(f.expr), f.id).toBeNull()
  })
  it('新しい人の初期値は RTS の表。式を選べる前からの人は Epley のまま', () => {
    expect(resolveFormula(DEFAULT_SETTINGS).formula.id).toBe('rts')
    expect(normalizeSettings({ id: 'settings', updatedAt: 1, goalTotal: 500 }).e1rmFormulaId).toBe('epley')
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, updatedAt: 1 }).e1rmFormulaId).toBe('rts')
    // 壊れた式からの戻り先は Epley
    expect(resolveFormula({ ...DEFAULT_SETTINGS, e1rmFormulaId: 'x' }).fn).toBe(epley)
  })
})

describe('サイクルはフェーズから組む', () => {
  it('日付は含めたフェーズから決まる', () => {
    expect(resolved()).toMatchObject({
      baseDate: '2026-11-30',
      endDate: '2027-02-28',
      dropRefDate: '2027-01-31',
    })
    expect(resolved().phases.map((p) => p.id)).toEqual(['bulk-1', 'cut-1'])
  })
  it('フェーズの日付を変えると、サイクルの日付も変わる', () => {
    const moved = EXAMPLE_PHASES.map((p) => (p.id === 'cut-1' ? { ...p, endDate: '2027-03-14' } : p))
    expect(resolved({}, moved).endDate).toBe('2027-03-14')
  })
  it('増量だけのサイクルでは落ち幅を見ない', () => {
    const c = resolved({ phaseIds: ['bulk-1'] })
    expect(c).toMatchObject({ endDate: '2027-01-31', dropRefDate: null })
    const j = judge(S, c, d.dailyLogs, d.topSets, '2027-02-28')
    expect(j.final).toBe(true)
    expect(j.gain).not.toBeNull()
    expect(j.drop).toBeNull()
    expect(j.classVerdict).toBeNull()
  })
  it('減量だけのサイクルは、始まる前日が落ち幅の起点', () => {
    expect(resolved({ phaseIds: ['cut-1'] })).toMatchObject({ baseDate: '2027-01-31', dropRefDate: '2027-01-31' })
  })
  it('フェーズが選ばれていない・開始日が無いフェーズだけのサイクルは判定に出さない', () => {
    const r = resolveCycles(
      [cycle(), cycle({ id: 'empty', phaseIds: [] }), cycle({ id: 'nf', phaseIds: ['nf-cut'] })],
      EXAMPLE_PHASES,
    )
    expect(r.cycles.map((c) => c.id)).toEqual(['cycle-1'])
    expect(r.unresolved.map((c) => c.id)).toEqual(['empty', 'nf'])
  })
  it('基準日の古い順に並ぶ', () => {
    const more: Phase[] = [
      ...EXAMPLE_PHASES,
      { ...EXAMPLE_PHASES[1], id: 'bulk-2', startDate: '2027-03-01', endDate: '2027-04-30' },
    ]
    const r = resolveCycles([cycle({ id: 'b', phaseIds: ['bulk-2'] }), cycle({ id: 'a' })], more)
    expect(r.cycles.map((c) => c.id)).toEqual(['a', 'b'])
  })
  it('今の形のサイクルには手を加えない', () => {
    expect(normalizeCycle(cycle(), EXAMPLE_PHASES)).toEqual(cycle())
  })
})

describe('サイクルのまとめ', () => {
  const sum = summarizeCycle(S, resolved(), d, '2027-02-28')
  const [bulk, cut] = sum.phases

  it('フェーズごとの体重の変化とペース', () => {
    expect(bulk.done && cut.done).toBe(true)
    expect(bulk.days).toBe(62)
    expect(cut.days).toBe(28)
    // サンプルは 72.5 → 75.6 → 73.9 の直線に ±0.3 の揺れ。週平均どうしの差なので端で少し内側に寄る
    expect(bulk.weightChange).toBeGreaterThan(2.6)
    expect(bulk.weightChange).toBeLessThan(3.2)
    expect(bulk.pacePerMonth).toBeCloseTo((bulk.weightChange as number) / (62 / 30.4375))
    expect(cut.weightChange).toBeGreaterThan(-1.8)
    expect(cut.weightChange).toBeLessThan(-1.2)
    expect(cut.pacePerMonth).toBeLessThan(0)
  })
  it('トータルの変化は、判定で使う値と同じ', () => {
    const j = judge(S, resolved(), d.dailyLogs, d.topSets, '2027-02-28')
    expect(cut.totalStart).toBeCloseTo(j.atBulkEnd?.total as number)
    expect(cut.totalEnd).toBeCloseTo(j.now.total as number)
    expect(cut.totalChange).toBeCloseTo(-(j.drop as number))
    expect(cut.totalChangePct).toBeCloseTo(-(j.dropPct as number))
    expect(bulk.totalChange).toBeGreaterThan(15)
    // 増量中は体重が増えたぶん、補正後の伸びは小さくなる
    expect(bulk.adjChange).toBeLessThan(bulk.totalChange as number)
  })
  it('種目別の変化・ウエスト・カロリー・記録率', () => {
    expect(bulk.liftChange.SQ).toBeGreaterThan(0)
    expect(bulk.waistChange).toBeGreaterThan(1)
    expect(cut.waistChange).toBeLessThan(0)
    expect(bulk.avgKcal).toBeGreaterThan(2600)
    expect(bulk.avgKcal).toBeLessThan(2800)
    expect(bulk.logRate).toBe(1)
    expect(sum.logRate).toBe(1)
    expect(bulk.avgSleepHr).toBeNull()
  })
  it('サイクル全体', () => {
    expect(sum.started).toBe(true)
    expect(sum.weightChange).toBeCloseTo((bulk.weightChange as number) + (cut.weightChange as number))
    expect(sum.adjChange).toBeCloseTo((bulk.adjChange as number) + (cut.adjChange as number))
  })
  it('途中なら今日までを数え、まだのフェーズは空欄', () => {
    const mid = summarizeCycle(S, resolved(), d, '2027-01-10')
    expect(mid.phases[0]).toMatchObject({ pending: false, done: false, to: '2027-01-10', days: 41 })
    expect(mid.phases[0].weightChange).toBeGreaterThan(1.5)
    expect(mid.phases[1]).toMatchObject({ pending: true, days: 0, weightChange: null, totalChange: null })
  })
  it('始まる前は何も出さない', () => {
    const before = summarizeCycle(S, resolved(), d, '2026-11-30')
    expect(before.started).toBe(false)
    expect(before.weightChange).toBeNull()
    expect(before.phases.every((p) => p.pending)).toBe(true)
  })
  it('睡眠時心拍数は期間中の平均', () => {
    const logs = d.dailyLogs.map((l) => (l.date >= '2027-02-01' ? { ...l, sleepHr: l.date < '2027-02-15' ? 50 : 54 } : l))
    const s2 = summarizeCycle(S, resolved(), { ...d, dailyLogs: logs }, '2027-02-28')
    expect(s2.phases[0].avgSleepHr).toBeNull()
    expect(s2.phases[1].avgSleepHr).toBeCloseTo(52)
    expect(s2.avgSleepHr).toBeCloseTo(52)
  })
  it('実測MAXと、その直前の推定1RMの比を種目ごとに出す', () => {
    const cp: Checkpoint = {
      date: '2027-02-27',
      updatedAt: 1,
      maxSQ: 180,
      maxBP: null,
      maxDL: 190,
      sleepHours: null,
      fatigue: null,
      memo: '',
    }
    const s2 = summarizeCycle(S, resolved(), { ...d, checkpoints: [cp] }, '2027-02-28')
    const sq = s2.maxRatio.SQ
    expect(sq).toMatchObject({ date: '2027-02-27', measured: 180 })
    expect(sq?.ratio).toBeCloseTo(180 / (sq?.estimated as number))
    // サンプルの SQ は Epley で 173〜175 前後、DL は 205 前後
    expect(sq?.ratio).toBeGreaterThan(1)
    expect(s2.maxRatio.DL?.ratio).toBeLessThan(1)
    expect(s2.maxRatio.BP).toBeNull()
  })
})
