import { describe, expect, it } from 'vitest'
import { createInitialGameState } from './factory'
import { canSpeak, isGivingLastWords } from './speech'
import type { GameState } from './types'

function executed(phase: GameState['phase'], deathDay = 2, day = 2): GameState {
  const g = createInitialGameState()
  g.day = day
  g.phase = phase
  g.players = g.players.map((p) =>
    p.id === 'p1' ? { ...p, alive: false, death: { day: deathDay, phase: 'execution', trueCause: 'execution', publicCause: '処刑' } } : p,
  )
  return g
}

describe('遺言での発言', () => {
  it('当日の処刑者は投票フェイズの間だけ発言できる', () => {
    expect(isGivingLastWords(executed('vote'), 'p1')).toBe(true)
    expect(canSpeak(executed('vote'), 'p1')).toBe(true)
    expect(canSpeak(executed('night'), 'p1')).toBe(false)
  })
  it('前日以前の処刑者・襲撃死は発言できない', () => {
    expect(canSpeak(executed('vote', 1, 2), 'p1')).toBe(false)
    const g = executed('vote')
    g.players = g.players.map((p) => (p.id === 'p1' ? { ...p, death: { ...p.death!, trueCause: 'wolf-attack', publicCause: '襲撃' } } : p))
    expect(canSpeak(g, 'p1')).toBe(false)
  })
  it('生存者は発言できる', () => {
    expect(canSpeak(executed('vote'), 'p2')).toBe(true)
  })
})
