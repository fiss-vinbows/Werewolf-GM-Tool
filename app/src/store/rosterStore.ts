import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newEventId } from '../domain/factory'
import { planSchedule, type RosterGame, type RosterMember } from '../domain/roster'

// 参加者名簿と試合の組み合わせ。ゲーム記録とは別に保存し、新規ゲームでも消えない。
type RosterStore = {
  members: RosterMember[]
  plannedGames: number
  seats: number // 1戦あたりの人間の参加人数
  games: RosterGame[]
  addMembers: (text: string) => void
  renameMember: (id: string, name: string) => void
  removeMember: (id: string) => void
  removeMembers: (ids: string[]) => void
  togglePresent: (id: string) => void
  setPlannedGames: (n: number) => void
  setSeats: (n: number) => void
  generateSchedule: () => void
  toggleParticipant: (gameId: string, memberId: string) => void
  setGameStatus: (gameId: string, status: RosterGame['status']) => void
  clearAll: () => void
}

export const useRosterStore = create<RosterStore>()(
  persist(
    (set, get) => ({
      members: [],
      plannedGames: 4,
      seats: 13,
      games: [],

      addMembers: (text) => {
        const existing = new Set(get().members.map((m) => m.name))
        const names = text
          .split(/[\n,、]/)
          .map((s) => s.trim())
          .filter((s) => s && !existing.has(s))
        const unique = [...new Set(names)]
        set((s) => ({ members: [...s.members, ...unique.map((name) => ({ id: newEventId('m'), name, present: true }))] }))
      },
      renameMember: (id, name) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, name } : m)) })),
      removeMember: (id) => get().removeMembers([id]),
      // 一括削除。未実施の試合からも外す（終了済みの試合の記録は残す）。
      removeMembers: (ids) => {
        const del = new Set(ids)
        set((s) => ({
          members: s.members.filter((m) => !del.has(m.id)),
          games: s.games.map((g) => (g.status === 'planned' ? { ...g, participantIds: g.participantIds.filter((x) => !del.has(x)) } : g)),
        }))
      },
      togglePresent: (id) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, present: !m.present } : m)) })),
      setPlannedGames: (n) => set({ plannedGames: Math.max(1, Math.min(20, n)) }),
      setSeats: (n) => set({ seats: Math.max(1, Math.min(14, n)) }),

      // 終了済みの試合は残し、予定の試合だけを出席者から作り直す。
      generateSchedule: () =>
        set((s) => {
          const played = s.games.filter((g) => g.status === 'played').sort((a, b) => a.index - b.index)
          const remaining = Math.max(0, s.plannedGames - played.length)
          const plans = planSchedule({
            memberIds: s.members.filter((m) => m.present).map((m) => m.id),
            playedGames: played.map((g) => g.participantIds),
            remainingGames: remaining,
            seats: s.seats,
          })
          const planned: RosterGame[] = plans.map((ids, i) => ({
            id: newEventId('rg'),
            index: played.length + i + 1,
            participantIds: ids,
            status: 'planned',
          }))
          return { games: [...played, ...planned] }
        }),
      toggleParticipant: (gameId, memberId) =>
        set((s) => ({
          games: s.games.map((g) => {
            if (g.id !== gameId || g.status !== 'planned') return g
            const has = g.participantIds.includes(memberId)
            const ids = has ? g.participantIds.filter((x) => x !== memberId) : [...g.participantIds, memberId]
            const order = new Map(s.members.map((m, i) => [m.id, i]))
            return { ...g, participantIds: ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) }
          }),
        })),
      setGameStatus: (gameId, status) => set((s) => ({ games: s.games.map((g) => (g.id === gameId ? { ...g, status } : g)) })),
      clearAll: () => set({ members: [], games: [] }),
    }),
    { name: 'wolf-gm-tool-roster' },
  ),
)
