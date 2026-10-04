import type { GameState, PlayerId } from './types'

// そのプレイヤーが今、発言（CO・結果公表・撤回）できるか。
// 生存者に加え、その日に処刑された人は夜フェイズに進むまでの遺言の間だけ発言できる。
export function canSpeak(game: GameState, playerId: PlayerId): boolean {
  const p = game.players.find((x) => x.id === playerId)
  if (!p) return false
  if (p.alive) return true
  return isGivingLastWords(game, playerId)
}

// 遺言の時間中か（当日の処刑者で、まだ夜フェイズに進んでいない）。
export function isGivingLastWords(game: GameState, playerId: PlayerId): boolean {
  const p = game.players.find((x) => x.id === playerId)
  return !!p && !p.alive && p.death?.trueCause === 'execution' && p.death.day === game.day && game.phase === 'vote'
}
