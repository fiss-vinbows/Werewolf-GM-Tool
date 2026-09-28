import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createInitialGameState, newEventId } from '../domain/factory'
import { ROLE_COUNTS, type SupportedPlayerCount } from '../domain/types'
import { validateRoleAssignment } from '../domain/roleValidation'
import { buildAiView } from '../domain/ai/view'
import { AI_VOTE_POLICY_VERSION, centralVoteOrder, decideVote } from '../domain/ai/vote'
import { AI_NIGHT_POLICY_VERSION, decideGuardTarget, decideSeerTarget, decideWolfAttack } from '../domain/ai/night'
import type {
  AiNightActionKind,
  AiNightDecision,
  AiVoteDecision,
  CoRecord,
  CoStatus,
  GamePhase,
  GameState,
  NightRecord,
  Player,
  PlayerId,
  ResultClaim,
  ResultClaimKind,
  RoleKey,
  SeatMode,
  Vote,
  VoteRound,
  VoteRoundKind,
} from '../domain/types'

const MAX_HISTORY = 30

function cloneState(state: GameState): GameState {
  // structuredClone が使えない古い環境向けのフォールバックとしてJSON経由でも複製する。
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as GameState)
}

function nextEventOrder(state: GameState): number {
  return state.eventCounter + 1
}

function nextVoteEventOrder(state: GameState): number {
  return state.voteEventCounter + 1
}

// 開いたままの一時停止区間があれば閉じる（次の日へ進む等のタイミングで取りこぼさないため）。
function closeOpenPause(intervals: GameState['pauseIntervals'], nowIso: string): GameState['pauseIntervals'] {
  if (intervals.length === 0 || intervals[intervals.length - 1].end !== null) return intervals
  return intervals.map((iv, i) => (i === intervals.length - 1 ? { ...iv, end: nowIso } : iv))
}

function ensureNightRecord(state: GameState, day: number): NightRecord {
  let record = state.nightRecords.find((n) => n.day === day)
  if (!record) {
    record = {
      day,
      seer: null,
      seerSkipped: false,
      medium: null,
      mediumSkipped: false,
      bodyguard: null,
      guardSkipped: false,
      wolf: null,
    }
    state.nightRecords.push(record)
  }
  return record
}

// 勝敗条件（人狼全滅で村人陣営勝利／生存人狼数がそれ以外の生存者数以上で人狼陣営勝利）を満たしたら自動確定する。
function computeWinner(players: Player[]): 'village' | 'wolf' | null {
  const aliveWolves = players.filter((p) => p.alive && p.actualRole === 'wolf').length
  const aliveOthers = players.filter((p) => p.alive && p.actualRole !== 'wolf').length
  if (aliveWolves === 0) return 'village'
  if (aliveWolves >= aliveOthers) return 'wolf'
  return null
}

function applyAutoWin(g: GameState): GameState {
  if (g.finished) return g
  const winner = computeWinner(g.players)
  if (!winner) return g
  return { ...g, finished: true, winner, phase: 'finished' }
}

type GameStore = {
  game: GameState
  // ラベル付きで「1つ戻る」用スナップショットを積む。
  pushHistory: (label: string) => void
  undo: () => void
  resetGame: () => void

  updateMeta: (patch: Partial<GameState['meta']>) => void
  setSeatMode: (mode: SeatMode) => void
  setRoleName: (role: RoleKey, name: string) => void

  // 参加人数（13/14）を変更する。登録完了前（setupフェーズ）のみ有効。
  setPlayerCount: (count: SupportedPlayerCount) => void
  setPlayerName: (id: PlayerId, name: string) => void
  setPlayerIsAi: (id: PlayerId, isAi: boolean) => void
  setPlayerSeat: (id: PlayerId, seat: number | null) => void
  setActualRole: (id: PlayerId, role: RoleKey | null) => void
  fillUnassignedAsVillager: () => void
  completeRegistration: () => boolean
  setPlayerDeath: (
    id: PlayerId,
    death: { day: number; phase: GamePhase; trueCause: 'execution' | 'wolf-attack' | 'other'; publicCause: string | null } | null,
  ) => void

  setPhase: (phase: GamePhase) => void
  // 日数はGMが手入力せず、夜フェイズの完了操作からのみ自動で進める（入力ミス防止）。
  advanceToNextDay: () => void
  // 議論終了（タイマー0 or 切り上げ）を記録する。投票タブの解禁に使う。
  endDiscussion: () => void

  addCoRecord: (input: { playerId: PlayerId; claimedRole: RoleKey; day: number; note?: string; afterVoteCount?: number | null }) => void
  retractCoRecord: (coId: string) => void
  // 誤記取り消し：GMの入力ミスとして記録自体を消す（本当に起きたCO撤回とは区別する、4-7）。
  eraseCoRecord: (coId: string) => void
  changeCoRecord: (input: {
    previousCoId: string
    playerId: PlayerId
    claimedRole: RoleKey
    day: number
    note?: string
    afterVoteCount?: number | null
  }) => void

  addResultClaim: (input: {
    coId: string
    kind: ResultClaimKind
    speakerId: PlayerId
    targetId: PlayerId
    targetDay: number
    announcedDay: number
    result: 'wolf' | 'not-wolf' | 'guarded'
  }) => void
  retractResultClaim: (id: string) => void
  eraseResultClaim: (id: string) => void
  // 予言者・霊媒師・狩人COのアイコンドラッグ操作から呼ぶ。対象日は色を付けた（主張した）順番で数える。
  addJudgmentByDrag: (
    speakerId: PlayerId,
    targetId: PlayerId,
    result: 'wolf' | 'not-wolf' | 'guarded',
    kind: 'seer' | 'medium' | 'bodyguard',
  ) => void

  startVoteRound: (input: { day: number; kind: VoteRoundKind; aiOrder: number | null; candidateIds: PlayerId[] }) => string
  castVote: (roundId: string, vote: { voterId: PlayerId; targetId: PlayerId }) => void
  removeVote: (roundId: string, voterId: PlayerId) => void
  // 決選投票の時短用：まだ投票していない対象者全員を一括でtargetIdへ投票させる。
  castRemainingVotes: (roundId: string, eligibleVoterIds: PlayerId[], targetId: PlayerId) => void
  // 得票を集計して確定する。最多得票が1人なら処刑を確定し、同数なら自動的に次の決選投票ラウンドを開始する
  // （決選2回目も同数なら処刑者なしで確定し、3回目は行わない）。
  finalizeVoteRound: (roundId: string) => void
  // AIの投票先を判断して表示する（未発表）。すでに有効な判断があれば何もしない。
  decideAiVote: (roundId: string, aiId: PlayerId) => void
  // 未発表のAI判断を破棄して、現時点の情報で判断し直す。
  redecideAiVote: (roundId: string, aiId: PlayerId) => void
  // GMが口頭発表した後に押す。AI票を確定して集計に加える（二重押下では重複しない）。
  announceAiVote: (roundId: string, aiId: PlayerId) => void
  // AIの夜行動を判断して保存する（同じ夜・同じ行動の判断があれば何もしない）。
  decideAiNightAction: (kind: AiNightActionKind, aiId: PlayerId) => void

  // 予言・霊媒の判定結果はGMが入力せず、真の役職からシステムが自動判定する。
  setSeerAction: (input: { day: number; targetId: PlayerId }) => void
  // 真の予言者がすでに死亡している場合に自動でスキップ済みにする。
  skipSeerAction: (day: number) => void
  setMediumAction: (input: { day: number; targetId: PlayerId }) => void
  // その日に処刑者がいない等、霊媒対象が存在しない場合に自動でスキップ済みにする。
  skipMediumAction: (day: number) => void
  // 護衛成功／襲撃成功も、護衛先と襲撃先の一致からシステムが自動判定する。
  setBodyguardAction: (input: { day: number; targetId: PlayerId }) => void
  // 真の狩人がすでに死亡している場合に自動でスキップ済みにする。
  skipGuardAction: (day: number) => void
  setWolfAction: (input: { day: number; targetId: PlayerId }) => void

  finishGame: (winner: 'village' | 'wolf') => void

  // 参加者の表示名だけを残し、それ以外の登録・進行記録をすべて初期化する。
  resetKeepingNames: () => void

  // 昼フェイズの議論タイマー（カウントダウン）。
  startDayTimer: () => void
  pauseDayTimer: () => void
  resetDayTimer: () => void
  // 残り時間（分）を設定し、タイマーを停止してその時間にリセットする。
  setDayTimerMinutes: (minutes: number) => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      game: createInitialGameState(),

      pushHistory: (label) =>
        set((s) => {
          // スナップショットに履歴自身を含めると再帰的に肥大化するため、履歴を除いた状態だけを保存する。
          const { history: _omit, ...withoutHistory } = s.game
          const snapshot = JSON.stringify(withoutHistory)
          const history = [...s.game.history, { label, timestamp: new Date().toISOString(), snapshot }]
          if (history.length > MAX_HISTORY) history.shift()
          return { game: { ...s.game, history } }
        }),

      undo: () =>
        set((s) => {
          const history = [...s.game.history]
          const last = history.pop()
          if (!last) return s
          const restored = JSON.parse(last.snapshot) as Omit<GameState, 'history'>
          // 復元後の履歴は、戻った時点までのものに揃える（今回の操作分を消費）。
          return { game: { ...restored, history } }
        }),

      resetGame: () => set({ game: createInitialGameState() }),

      updateMeta: (patch) =>
        set((s) => ({
          game: { ...s.game, meta: { ...s.game.meta, ...patch, updatedAt: new Date().toISOString() } },
        })),

      setSeatMode: (mode) =>
        set((s) => ({ game: { ...s.game, meta: { ...s.game.meta, seatMode: mode, updatedAt: new Date().toISOString() } } })),

      setRoleName: (role, name) =>
        set((s) => ({
          game: {
            ...s.game,
            meta: { ...s.game.meta, roleNames: { ...s.game.meta.roleNames, [role]: name }, updatedAt: new Date().toISOString() },
          },
        })),

      setPlayerCount: (count) => {
        if (get().game.phase !== 'setup') return
        get().pushHistory('参加人数の変更')
        set((s) => {
          const current = s.game.players
          const players =
            count > current.length
              ? [
                  ...current,
                  ...Array.from({ length: count - current.length }, (_, i) => {
                    const order = current.length + i + 1
                    return {
                      id: `p${order}`,
                      displayName: `プレイヤー${order}`,
                      registrationOrder: order,
                      isAi: false,
                      actualRole: null,
                      seatNumber: order,
                      alive: true,
                      death: null,
                    } as Player
                  }),
                ]
              : current.slice(0, count)
          return { game: { ...s.game, players, meta: { ...s.game.meta, playerCount: count } } }
        })
      },

      setPlayerName: (id, name) => {
        get().pushHistory('表示名の変更')
        set((s) => ({
          game: { ...s.game, players: s.game.players.map((p) => (p.id === id ? { ...p, displayName: name } : p)) },
        }))
      },

      setPlayerIsAi: (id, isAi) => {
        get().pushHistory('AI設定の変更')
        set((s) => ({
          game: { ...s.game, players: s.game.players.map((p) => (p.id === id ? { ...p, isAi } : p)) },
        }))
      },

      setPlayerSeat: (id, seat) => {
        get().pushHistory('座席の変更')
        set((s) => ({
          game: { ...s.game, players: s.game.players.map((p) => (p.id === id ? { ...p, seatNumber: seat } : p)) },
        }))
      },

      setActualRole: (id, role) => {
        get().pushHistory('実役職の登録')
        set((s) => {
          const players = s.game.players.map((p) => (p.id === id ? { ...p, actualRole: role } : p))
          const wolves = players.filter((p) => p.actualRole === 'wolf')
          const seer = players.find((p) => p.actualRole === 'seer')
          // 初日白：人狼全員と予言者本人の登録が揃った時点で、人狼と予言者本人を除く参加者から
          // 一度だけ抽選する（3章）。条件が崩れたら（訂正等）取り消し、揃い直したら再抽選する。
          const conditionMet = wolves.length === ROLE_COUNTS.wolf && !!seer
          let day1WhiteNotice = s.game.day1WhiteNotice
          if (!conditionMet) {
            day1WhiteNotice = null
          } else if (!day1WhiteNotice || !players.some((p) => p.id === day1WhiteNotice)) {
            const candidates = players.filter((p) => p.actualRole !== 'wolf' && p.id !== seer!.id)
            const pick = candidates[Math.floor(Math.random() * candidates.length)]
            day1WhiteNotice = pick ? pick.id : null
          }
          return { game: { ...s.game, players, day1WhiteNotice } }
        })
      },

      setPlayerDeath: (id, death) => {
        get().pushHistory('生死・死因の記録')
        set((s) => {
          const players = s.game.players.map((p) => (p.id === id ? { ...p, alive: death === null, death } : p))
          return { game: applyAutoWin({ ...s.game, players }) }
        })
      },

      fillUnassignedAsVillager: () => {
        get().pushHistory('未確認を村人に一括設定')
        set((s) => ({
          game: {
            ...s.game,
            players: s.game.players.map((p) => (p.actualRole ? p : { ...p, actualRole: 'villager' })),
          },
        }))
      },

      completeRegistration: () => {
        const projectedPlayers = get().game.players.map((p) => (p.actualRole ? p : { ...p, actualRole: 'villager' as RoleKey }))
        if (!validateRoleAssignment(projectedPlayers).valid) return false
        get().pushHistory('登録完了・1日目開始')
        set((s) => ({
          game: {
            ...s.game,
            players: projectedPlayers,
            day: 1,
            phase: 'day',
          },
        }))
        return true
      },

      setPhase: (phase) => set((s) => ({ game: { ...s.game, phase } })),

      advanceToNextDay: () => {
        get().pushHistory('翌日へ進行')
        // ゲーム全体の投票通し番号・議論終了フラグは日をまたぐとリセットする。
        set((s) => ({
          game: {
            ...s.game,
            day: s.game.day + 1,
            phase: 'day',
            voteEventCounter: 0,
            discussionEnded: false,
            pauseIntervals: closeOpenPause(s.game.pauseIntervals, new Date().toISOString()),
          },
        }))
      },

      // 議論タイマーが0になった、または「議論を切り上げる」ボタンが押されたときに呼ぶ。
      // これがtrueになるまで投票タブへは移動できない（誤操作防止）。
      endDiscussion: () => {
        set((s) => (s.game.discussionEnded ? s : { game: { ...s.game, discussionEnded: true } }))
      },

      addCoRecord: ({ playerId, claimedRole, day, note, afterVoteCount }) => {
        get().pushHistory('CO記録の追加')
        set((s) => {
          const g = cloneState(s.game)
          const record: CoRecord = {
            id: newEventId('co'),
            eventOrder: nextEventOrder(g),
            day,
            claimedRole,
            playerId,
            recordedAt: new Date().toISOString(),
            status: 'active',
            supersedes: null,
            note: note ?? '',
            afterVoteCount: afterVoteCount ?? null,
          }
          g.coRecords.push(record)
          g.eventCounter += 1
          return { game: g }
        })
      },

      retractCoRecord: (coId) => {
        const s = get().game
        const record = s.coRecords.find((c) => c.id === coId)
        const player = record && s.players.find((p) => p.id === record.playerId)
        if (!player?.alive) return // 死亡したプレイヤーは発言できないため撤回できない。
        get().pushHistory('COの撤回')
        set((s2) => ({
          game: {
            ...s2.game,
            coRecords: s2.game.coRecords.map((c) => (c.id === coId ? { ...c, status: 'retracted' as CoStatus } : c)),
          },
        }))
      },

      eraseCoRecord: (coId) => {
        get().pushHistory('CO記録の誤記取り消し')
        set((s) => ({ game: { ...s.game, coRecords: s.game.coRecords.filter((c) => c.id !== coId) } }))
      },

      changeCoRecord: ({ previousCoId, playerId, claimedRole, day, note, afterVoteCount }) => {
        get().pushHistory('COの変更（スライド）')
        set((s) => {
          const g = cloneState(s.game)
          g.coRecords = g.coRecords.map((c) => (c.id === previousCoId ? { ...c, status: 'changed' as CoStatus } : c))
          const record: CoRecord = {
            id: newEventId('co'),
            eventOrder: nextEventOrder(g),
            day,
            claimedRole,
            playerId,
            recordedAt: new Date().toISOString(),
            status: 'active',
            supersedes: previousCoId,
            note: note ?? '',
            afterVoteCount: afterVoteCount ?? null,
          }
          g.coRecords.push(record)
          g.eventCounter += 1
          return { game: g }
        })
      },

      addResultClaim: (input) => {
        get().pushHistory('公表結果の追加')
        set((s) => {
          const g = cloneState(s.game)
          const claim: ResultClaim = {
            id: newEventId('claim'),
            eventOrder: nextEventOrder(g),
            ...input,
            recordedAt: new Date().toISOString(),
            retracted: false,
          }
          g.resultClaims.push(claim)
          g.eventCounter += 1
          return { game: g }
        })
      },

      retractResultClaim: (id) => {
        const s = get().game
        const claim = s.resultClaims.find((c) => c.id === id)
        const speaker = claim && s.players.find((p) => p.id === claim.speakerId)
        if (!speaker?.alive) return // 死亡したプレイヤーは発言できないため撤回できない。
        get().pushHistory('公表結果の訂正')
        set((s2) => ({
          game: { ...s2.game, resultClaims: s2.game.resultClaims.map((c) => (c.id === id ? { ...c, retracted: true } : c)) },
        }))
      },

      eraseResultClaim: (id) => {
        get().pushHistory('公表結果の誤記取り消し')
        set((s) => ({ game: { ...s.game, resultClaims: s.game.resultClaims.filter((c) => c.id !== id) } }))
      },

      addJudgmentByDrag: (speakerId, targetId, result, kind) => {
        const label = kind === 'seer' ? '予言結果の色付け' : kind === 'medium' ? '霊媒結果の色付け' : '護衛先の主張の記録'
        get().pushHistory(label)
        set((s) => {
          const g = cloneState(s.game)
          const co = g.coRecords.find((c) => c.playerId === speakerId && c.status === 'active' && c.claimedRole === kind)
          if (!co) return { game: s.game }
          // ResultClaimKind上は狩人の主張も 'guard' として保存する（4-3）。
          const claimKind: ResultClaimKind = kind === 'bodyguard' ? 'guard' : kind
          // 対象日は実際の日付ではなく、色を付けた（主張した）順番で数える（ユーザー指定の簡略運用）。
          const order = g.resultClaims.filter((c) => c.speakerId === speakerId && c.kind === claimKind).length + 1
          const claim: ResultClaim = {
            id: newEventId('claim'),
            eventOrder: nextEventOrder(g),
            coId: co.id,
            kind: claimKind,
            speakerId,
            targetId,
            targetDay: order,
            announcedDay: g.day,
            result,
            recordedAt: new Date().toISOString(),
            retracted: false,
          }
          g.resultClaims.push(claim)
          g.eventCounter += 1
          return { game: g }
        })
      },

      startVoteRound: ({ day, kind, aiOrder, candidateIds }) => {
        get().pushHistory('投票ラウンド開始')
        const id = newEventId('round')
        set((s) => {
          // AIが参加する通常投票では、初期値がなければ中央順をラウンド開始時に1度だけ抽選して保存する（方針D）。
          const hasAi = s.game.players.some((p) => p.alive && p.isAi)
          if (kind === 'normal' && aiOrder === null && hasAi) {
            aiOrder = centralVoteOrder(s.game.players.filter((p) => p.alive).length)
          }
          const round: VoteRound = {
            id,
            day,
            kind,
            aiOrder,
            votes: [],
            candidateIds,
            executedId: null,
            resolved: false,
            nextVoteOrder: 1,
          }
          return { game: { ...s.game, voteRounds: [...s.game.voteRounds, round] } }
        })
        return id
      },

      castVote: (roundId, vote) => {
        get().pushHistory('投票の入力')
        set((s) => {
          const g = cloneState(s.game)
          g.voteRounds = g.voteRounds.map((r) => {
            if (r.id !== roundId) return r
            const newVote: Vote = {
              ...vote,
              recordedAt: new Date().toISOString(),
              order: r.nextVoteOrder,
              globalOrder: nextVoteEventOrder(g),
            }
            g.voteEventCounter += 1
            return {
              ...r,
              votes: [...r.votes.filter((v) => v.voterId !== vote.voterId), newVote],
              nextVoteOrder: r.nextVoteOrder + 1,
            }
          })
          return { game: g }
        })
      },

      removeVote: (roundId, voterId) => {
        get().pushHistory('投票の取り消し')
        set((s) => {
          const g = cloneState(s.game)
          const round = g.voteRounds.find((r) => r.id === roundId)
          if (!round) return { game: s.game }
          const removed = round.votes.find((v) => v.voterId === voterId)
          round.votes = round.votes.filter((v) => v.voterId !== voterId)
          // AI票を取り消した場合は、判断を「表示済み・未発表」へ戻す（発表後の訂正として履歴に残る）。
          round.aiDecisions = round.aiDecisions?.map((d) => (d.aiId === voterId && d.status === 'announced' ? { ...d, status: 'shown' } : d))
          if (removed) {
            // 直近の投票を訂正のために取り消した場合は、番号を巻き戻して欠番のまま増え続けないようにする。
            if (removed.order === round.nextVoteOrder - 1) round.nextVoteOrder -= 1
            if (removed.globalOrder === g.voteEventCounter) g.voteEventCounter -= 1
          }
          return { game: g }
        })
      },

      castRemainingVotes: (roundId, eligibleVoterIds, targetId) => {
        get().pushHistory('残り全員を一括投票')
        set((s) => {
          const g = cloneState(s.game)
          g.voteRounds = g.voteRounds.map((r) => {
            if (r.id !== roundId) return r
            const alreadyVoted = new Set(r.votes.map((v) => v.voterId))
            let order = r.nextVoteOrder
            const additions: Vote[] = eligibleVoterIds
              .filter((id) => !alreadyVoted.has(id))
              .map((voterId) => {
                const globalOrder = nextVoteEventOrder(g)
                g.voteEventCounter += 1
                return { voterId, targetId, recordedAt: new Date().toISOString(), order: order++, globalOrder }
              })
            return { ...r, votes: [...r.votes, ...additions], nextVoteOrder: order }
          })
          return { game: g }
        })
      },

      finalizeVoteRound: (roundId) => {
        get().pushHistory('投票結果の確定')
        set((s) => {
          const g = cloneState(s.game)
          const round = g.voteRounds.find((r) => r.id === roundId)
          if (!round || round.resolved) return { game: s.game }

          const targets = round.kind === 'normal' ? g.players.filter((p) => p.alive).map((p) => p.id) : round.candidateIds
          const counts = targets.map((id) => ({ id, count: round.votes.filter((v) => v.targetId === id).length }))
          const maxCount = Math.max(0, ...counts.map((c) => c.count))
          const leaders = counts.filter((c) => c.count === maxCount && maxCount > 0).map((c) => c.id)

          if (leaders.length === 1) {
            // 最多得票が1人に決まった：処刑を確定する。
            const executedId = leaders[0]
            round.executedId = executedId
            round.resolved = true
            g.players = g.players.map((p) =>
              p.id === executedId ? { ...p, alive: false, death: { day: round.day, phase: 'execution', trueCause: 'execution', publicCause: '処刑' } } : p,
            )
            return { game: applyAutoWin(g) }
          }

          // 投票なし、または同数。
          round.executedId = null
          round.resolved = true
          if (leaders.length <= 1 || round.kind === 'runoff2') {
            // 投票なし、または決選2回目の同数：処刑者なしで確定する（3回目の決選は行わない）。
            return { game: g }
          }
          // 同数のため自動的に次の決選投票ラウンドへ進む。
          const nextKind: VoteRoundKind = round.kind === 'normal' ? 'runoff1' : 'runoff2'
          const nextRound: VoteRound = {
            id: newEventId('round'),
            day: round.day,
            kind: nextKind,
            aiOrder: null,
            votes: [],
            candidateIds: leaders,
            executedId: null,
            resolved: false,
            nextVoteOrder: 1,
          }
          g.voteRounds.push(nextRound)
          return { game: g }
        })
      },

      decideAiVote: (roundId, aiId) => {
        const g0 = get().game
        const round0 = g0.voteRounds.find((r) => r.id === roundId)
        if (!round0 || round0.resolved) return
        if (round0.aiDecisions?.some((d) => d.aiId === aiId && d.status !== 'superseded')) return
        get().pushHistory('AIの投票判断')
        set((s) => {
          const g = cloneState(s.game)
          const round = g.voteRounds.find((r) => r.id === roundId)!
          const view = buildAiView(g, aiId, { currentRoundId: roundId })
          const result = decideVote(view, { id: round.id, kind: round.kind, candidateIds: round.candidateIds })
          const decision: AiVoteDecision = {
            id: newEventId('aivote'),
            aiId,
            targetId: result.targetId,
            reasons: result.reasons,
            policyVersion: AI_VOTE_POLICY_VERSION,
            decidedAt: new Date().toISOString(),
            visibleVoteCount: view.voteRounds.find((r) => r.id === roundId)?.votes.length ?? 0,
            status: 'shown',
          }
          round.aiDecisions = [...(round.aiDecisions ?? []), decision]
          return { game: g }
        })
      },

      redecideAiVote: (roundId, aiId) => {
        const round0 = get().game.voteRounds.find((r) => r.id === roundId)
        const current = round0?.aiDecisions?.find((d) => d.aiId === aiId && d.status !== 'superseded')
        if (!round0 || round0.resolved || current?.status === 'announced') return
        set((s) => {
          const g = cloneState(s.game)
          const round = g.voteRounds.find((r) => r.id === roundId)!
          round.aiDecisions = round.aiDecisions?.map((d) => (d.aiId === aiId && d.status === 'shown' ? { ...d, status: 'superseded' } : d))
          return { game: g }
        })
        get().decideAiVote(roundId, aiId)
      },

      announceAiVote: (roundId, aiId) => {
        const round = get().game.voteRounds.find((r) => r.id === roundId)
        const decision = round?.aiDecisions?.find((d) => d.aiId === aiId && d.status === 'shown')
        if (!round || round.resolved || !decision) return
        if (round.votes.some((v) => v.voterId === aiId)) return
        get().castVote(roundId, { voterId: aiId, targetId: decision.targetId })
        set((s) => {
          const g = cloneState(s.game)
          const r = g.voteRounds.find((x) => x.id === roundId)!
          r.aiDecisions = r.aiDecisions?.map((d) => (d.id === decision.id ? { ...d, status: 'announced' } : d))
          return { game: g }
        })
      },

      decideAiNightAction: (kind, aiId) => {
        const g0 = get().game
        if (g0.aiNightDecisions?.some((d) => d.day === g0.day && d.kind === kind)) return
        get().pushHistory('AIの夜行動の判断')
        set((s) => {
          const g = cloneState(s.game)
          const view = buildAiView(g, aiId)
          let result: { targetId: PlayerId; reasons: string[]; mode?: AiNightDecision['guardMode'] }
          if (kind === 'seer') result = decideSeerTarget(view)
          else if (kind === 'wolf') result = decideWolfAttack(view)
          else {
            const prev = g.aiNightDecisions?.find((d) => d.kind === 'guard' && d.aiId === aiId && d.day === g.day - 1)
            result = decideGuardTarget(view, prev?.guardMode ?? null)
          }
          const decision: AiNightDecision = {
            id: newEventId('ainight'),
            day: g.day,
            aiId,
            kind,
            targetId: result.targetId,
            guardMode: result.mode,
            reasons: result.reasons,
            policyVersion: AI_NIGHT_POLICY_VERSION,
            decidedAt: new Date().toISOString(),
          }
          g.aiNightDecisions = [...(g.aiNightDecisions ?? []), decision]
          return { game: g }
        })
      },

      setSeerAction: ({ day, targetId }) => {
        get().pushHistory('予言結果の記録')
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          const target = g.players.find((p) => p.id === targetId)
          const result: 'wolf' | 'not-wolf' = target?.actualRole === 'wolf' ? 'wolf' : 'not-wolf'
          record.seer = { day, targetId, result }
          record.seerSkipped = false
          return { game: g }
        })
      },

      skipSeerAction: (day) => {
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          if (record.seer || record.seerSkipped) return { game: s.game }
          record.seerSkipped = true
          return { game: g }
        })
      },

      setMediumAction: ({ day, targetId }) => {
        get().pushHistory('霊媒結果の記録')
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          const target = g.players.find((p) => p.id === targetId)
          const result: 'wolf' | 'not-wolf' = target?.actualRole === 'wolf' ? 'wolf' : 'not-wolf'
          record.medium = { day, targetId, result }
          record.mediumSkipped = false
          return { game: g }
        })
      },

      skipMediumAction: (day) => {
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          if (record.medium || record.mediumSkipped) return { game: s.game }
          record.mediumSkipped = true
          return { game: g }
        })
      },

      // 人狼→予言者→霊媒師→狩人の順で処理する（狩人は人狼の襲撃先が決まっていないと判定できない）。
      setBodyguardAction: ({ day, targetId }) => {
        get().pushHistory('護衛行動の記録')
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          if (!record.wolf) return { game: s.game }
          const success = record.wolf.targetId === targetId
          record.bodyguard = { day, targetId, success }
          record.guardSkipped = false
          if (success) {
            // 護衛成功：襲撃を無効化し、仮に反映していた死亡を取り消す。
            record.wolf.success = false
            g.players = g.players.map((p) => (p.id === targetId ? { ...p, alive: true, death: null } : p))
          } else {
            record.wolf.success = true
          }
          return { game: applyAutoWin(g) }
        })
      },

      skipGuardAction: (day) => {
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          if (record.bodyguard || record.guardSkipped) return { game: s.game }
          record.guardSkipped = true
          // 狩人がいない（死亡している）ため護衛による蘇生はない。ここで夜の死亡が確定するので勝敗を判定する。
          return { game: applyAutoWin(g) }
        })
      },

      // 人狼の襲撃先を記録する。成否は狩人の護衛判定が終わるまでの仮の結果（護衛成功時に自動で取り消す）。
      setWolfAction: ({ day, targetId }) => {
        get().pushHistory('襲撃行動の記録')
        set((s) => {
          const g = cloneState(s.game)
          const record = ensureNightRecord(g, day)
          record.wolf = { day, targetId, success: true }
          g.players = g.players.map((p) =>
            p.id === targetId ? { ...p, alive: false, death: { day, phase: 'night', trueCause: 'wolf-attack', publicCause: '襲撃' } } : p,
          )
          // 護衛によって蘇生される可能性があるため、勝敗判定は狩人の護衛処理の確定後に行う。
          return { game: g }
        })
      },

      finishGame: (winner) => {
        get().pushHistory('ゲーム終了')
        set((s) => ({ game: { ...s.game, finished: true, winner, phase: 'finished' } }))
      },

      resetKeepingNames: () => {
        set((s) => {
          const fresh = createInitialGameState()
          fresh.players = fresh.players.map((p, i) => ({ ...p, displayName: s.game.players[i]?.displayName ?? p.displayName }))
          return { game: fresh }
        })
      },

      // タイマーの開始・一時停止・リセット・時間設定は進行の巻き戻し対象にしない（UI用の補助機能のため）。
      // 一時停止していた期間はCO・公表結果の「経過時間」表示から差し引く（タイマーを止めている間は進めない）。
      startDayTimer: () => {
        set((s) => {
          if (s.game.dayTimer.running || s.game.dayTimer.remainingMs <= 0) return s
          const now = new Date().toISOString()
          return {
            game: {
              ...s.game,
              dayTimer: { ...s.game.dayTimer, running: true, startedAt: now },
              pauseIntervals: closeOpenPause(s.game.pauseIntervals, now),
            },
          }
        })
      },

      pauseDayTimer: () => {
        set((s) => {
          const t = s.game.dayTimer
          if (!t.running || !t.startedAt) return s
          const now = new Date().toISOString()
          const elapsed = Date.now() - new Date(t.startedAt).getTime()
          const remainingMs = Math.max(0, t.remainingMs - elapsed)
          return {
            game: {
              ...s.game,
              dayTimer: { ...t, running: false, startedAt: null, remainingMs },
              pauseIntervals: [...s.game.pauseIntervals, { start: now, end: null }],
            },
          }
        })
      },

      resetDayTimer: () => {
        set((s) => ({
          game: {
            ...s.game,
            dayTimer: { ...s.game.dayTimer, running: false, startedAt: null, remainingMs: s.game.dayTimer.durationMs },
            pauseIntervals: closeOpenPause(s.game.pauseIntervals, new Date().toISOString()),
          },
        }))
      },

      setDayTimerMinutes: (minutes) => {
        const ms = Math.max(0, Math.round(minutes * 60 * 1000))
        set((s) => ({ game: { ...s.game, dayTimer: { running: false, startedAt: null, durationMs: ms, remainingMs: ms } } }))
      },
    }),
    {
      name: 'wolf-gm-tool-autosave',
      // 誤終了・再読み込みからの自動復旧のみを目的とする（4-7）。
      partialize: (state) => ({ game: state.game }),
    },
  ),
)
