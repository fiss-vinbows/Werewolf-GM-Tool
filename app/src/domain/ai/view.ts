// AIプレイヤーが判断に使ってよい情報だけを取り出す情報フィルタ層（仕様5-1）。
// GMが保存している全情報（真の配役・他者の非公開結果・未公開の同時投票先）は、
// ここを通さずにAIの判断ロジックへ渡してはいけない。
import type { CoRecord, GameState, PlayerId, ResultClaim, RoleKey, VoteRoundKind } from '../types'

export type PublicPlayer = {
  id: PlayerId
  displayName: string
  alive: boolean
  // 公開された死亡情報。死因は実際の死因ではなく公表内容から判断する。
  death: { day: number; cause: 'execution' | 'attack' | 'other' } | null
}

export type PublicVote = { voterId: PlayerId; targetId: PlayerId; order: number; afterEventOrder?: number }

export type PublicVoteRound = {
  id: string
  day: number
  kind: VoteRoundKind
  candidateIds: PlayerId[]
  votes: PublicVote[]
  executedId: PlayerId | null
  resolved: boolean
}

export type OwnResult = { day: number; targetId: PlayerId; result: 'wolf' | 'not-wolf' }

export type AiView = {
  selfId: PlayerId
  selfRole: RoleKey
  day: number
  players: PublicPlayer[]
  // 現在も有効なCOと、撤回・変更済みを含むCO履歴（対抗の有無の判定用）。
  coRecords: CoRecord[]
  // 撤回されていない公表結果。
  resultClaims: ResultClaim[]
  // プレイヤー自身が撤回・訂正した公表結果（破綻解除の判定用、7-4）。
  // GMの入力ミスは「1つ戻る」で記録ごと消えるため、ここには含まれない。
  retractedResultClaims: ResultClaim[]
  // 判断時点までに公開された投票ラウンド。判断中のラウンドは公開済みの票だけを含む。
  voteRounds: PublicVoteRound[]
  // GMから全員へ通知された護衛成功の夜（誰を守ったかは含まない）。
  guardSuccessNights: number[]
  // 自分の役職で知ることのできる非公開情報。
  ownSeerResults: OwnResult[]
  ownMediumResults: OwnResult[]
  wolfMateIds: PlayerId[]
  // 狩人なら自分の過去の護衛先と成否。
  ownGuardHistory: { day: number; targetId: PlayerId; success: boolean }[]
}

export type AiViewOptions = {
  // 判断中の投票ラウンド。決選投票では当該ラウンドの票を一切見せない（4-4-2）。
  currentRoundId?: string
}

export function buildAiView(game: GameState, selfId: PlayerId, opts: AiViewOptions = {}): AiView {
  const self = game.players.find((p) => p.id === selfId)
  if (!self) throw new Error(`AIプレイヤーが見つかりません: ${selfId}`)
  const selfRole = self.actualRole ?? 'villager'
  const day = game.day

  const players: PublicPlayer[] = game.players.map((p) => {
    // 今夜の襲撃による死亡は翌朝まで公開されないため、生存として見せる。
    const tonightAttack = p.death?.phase === 'night' && p.death.day === day
    return {
      id: p.id,
      displayName: p.displayName,
      alive: p.alive || tonightAttack,
      death:
        tonightAttack || !p.death
          ? null
          : {
              day: p.death.day,
              // 公表された死因のみを使う。
              cause: p.death.publicCause === '処刑' ? 'execution' : p.death.publicCause === '襲撃' ? 'attack' : 'other',
            },
    }
  })

  const voteRounds: PublicVoteRound[] = game.voteRounds
    .filter((r) => r.day <= day)
    .map((r) => {
      const isCurrent = r.id === opts.currentRoundId
      const hideVotes = isCurrent && r.kind !== 'normal'
      return {
        id: r.id,
        day: r.day,
        kind: r.kind,
        candidateIds: [...r.candidateIds],
        votes: hideVotes ? [] : r.votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId, order: v.order, afterEventOrder: v.afterEventOrder })),
        executedId: r.resolved ? r.executedId : null,
        resolved: r.resolved,
      }
    })

  // 夜の記録は、その夜が明けた後（翌日以降）にだけ参照できる。
  const pastNights = game.nightRecords.filter((n) => n.day < day)
  const guardSuccessNights = pastNights.filter((n) => n.bodyguard?.success).map((n) => n.day)

  const ownSeerResults: OwnResult[] = []
  const ownMediumResults: OwnResult[] = []
  if (selfRole === 'seer') {
    if (game.day1WhiteNotice) ownSeerResults.push({ day: 0, targetId: game.day1WhiteNotice, result: 'not-wolf' })
    for (const n of pastNights) if (n.seer) ownSeerResults.push({ day: n.day, targetId: n.seer.targetId, result: n.seer.result })
  }
  if (selfRole === 'medium') {
    for (const n of pastNights) if (n.medium) ownMediumResults.push({ day: n.day, targetId: n.medium.targetId, result: n.medium.result })
  }
  // 人狼は仲間を知る。狂人には人狼の正体を教えない（5-1）。
  const wolfMateIds = selfRole === 'wolf' ? game.players.filter((p) => p.actualRole === 'wolf' && p.id !== selfId).map((p) => p.id) : []

  const ownGuardHistory =
    selfRole === 'bodyguard'
      ? pastNights.filter((n) => n.bodyguard).map((n) => ({ day: n.day, targetId: n.bodyguard!.targetId, success: n.bodyguard!.success }))
      : []

  return {
    selfId,
    selfRole,
    day,
    players,
    coRecords: game.coRecords.filter((c) => c.day <= day).map((c) => ({ ...c })),
    resultClaims: game.resultClaims.filter((c) => !c.retracted && c.announcedDay <= day).map((c) => ({ ...c })),
    retractedResultClaims: game.resultClaims.filter((c) => c.retracted && c.announcedDay <= day).map((c) => ({ ...c })),
    voteRounds,
    guardSuccessNights,
    ownSeerResults,
    ownMediumResults,
    wolfMateIds,
    ownGuardHistory,
  }
}
