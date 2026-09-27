import { DEFAULT_ROLE_NAMES, type GameState, type Player } from './types'

export function newGameId(): string {
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createInitialPlayers(count: number = 13): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    displayName: `プレイヤー${i + 1}`,
    registrationOrder: i + 1,
    isAi: false,
    actualRole: null,
    seatNumber: i + 1,
    alive: true,
    death: null,
  }))
}

const DEFAULT_TIMER_SECONDS = 300 // 5分

export function createInitialGameState(): GameState {
  const now = new Date().toISOString()
  return {
    meta: {
      gameId: newGameId(),
      createdAt: now,
      updatedAt: now,
      ruleNote: '',
      memo: '',
      seatMode: 'fixed',
      roleNames: { ...DEFAULT_ROLE_NAMES },
      playerCount: 13,
      defaultAiOrder: null,
      defaultTimerSeconds: DEFAULT_TIMER_SECONDS,
      resultLabelStyle: 'wolf-human',
    },
    players: createInitialPlayers(13),
    day: 0,
    phase: 'setup',
    coRecords: [],
    resultClaims: [],
    voteRounds: [],
    nightRecords: [],
    eventCounter: 0,
    voteEventCounter: 0,
    dayTimer: { running: false, startedAt: null, durationMs: DEFAULT_TIMER_SECONDS * 1000, remainingMs: DEFAULT_TIMER_SECONDS * 1000 },
    pauseIntervals: [],
    discussionEnded: false,
    day1WhiteNotice: null,
    finished: false,
    winner: null,
    history: [],
  }
}
