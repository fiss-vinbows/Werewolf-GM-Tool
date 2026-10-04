import { describe, expect, it } from 'vitest'
import { planSchedule } from './roster'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`)
const countOf = (games: string[][]) => {
  const m = new Map<string, number>()
  for (const g of games) for (const id of g) m.set(id, (m.get(id) ?? 0) + 1)
  return m
}

describe('参加者選出', () => {
  it('20人・4戦・13人なら全員が2〜3回で、2連続で休む人がいない', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1
      const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647)
      const games = planSchedule({ memberIds: ids(20), playedGames: [], remainingGames: 4, seats: 13, rng })
      expect(games.every((g) => g.length === 13)).toBe(true)
      const c = countOf(games)
      for (const id of ids(20)) expect([2, 3]).toContain(c.get(id) ?? 0)
      for (let i = 1; i < games.length; i++) {
        const restedBoth = ids(20).filter((id) => !games[i - 1].includes(id) && !games[i].includes(id))
        expect(restedBoth).toEqual([])
      }
    }
  })
  it('終了済みの試合を考慮して残りを割り当てる（途中参加者を優先）', () => {
    const played = [ids(13)]
    const games = planSchedule({ memberIds: [...ids(20), 'late'], playedGames: played, remainingGames: 1, seats: 13 })
    expect(games[0]).toContain('late')
    for (const id of ['m14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20']) expect(games[0]).toContain(id)
  })
})
