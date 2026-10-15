import { describe, expect, it } from 'vitest'
import { parseRoute, routePath } from './route'

describe('画面の位置', () => {
  it('# 以降を読む', () => {
    expect(parseRoute('')).toEqual({ tab: 'home', sub: null, id: null })
    expect(parseRoute('#/settings/data')).toEqual({ tab: 'settings', sub: 'data', id: null })
    expect(parseRoute('#/review/report/cycle-1')).toEqual({ tab: 'review', sub: 'report', id: 'cycle-1' })
    expect(parseRoute('#/nowhere')).toEqual({ tab: 'home', sub: null, id: null })
  })
  it('書いて読むと元に戻る', () => {
    const p = routePath('review', 'report', 'a/b c')
    expect(parseRoute(p)).toEqual({ tab: 'review', sub: 'report', id: 'a/b c' })
    expect(routePath('plan')).toBe('#/plan')
  })
})
