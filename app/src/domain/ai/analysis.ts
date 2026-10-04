// AIの公開情報分析（仕様5-3〜5-4-5、7章）。すべてAiViewだけを入力とし、真の配役は参照しない。
import type { PlayerId, RoleKey } from '../types'
import type { AiView, PublicVoteRound } from './view'

// 人狼陣営の最大人数（人狼3＋狂人1）。処刑余裕数の計算に使う（方針C-2b）。
const MAX_EVIL = 4

export function aliveIds(view: AiView): PlayerId[] {
  return view.players.filter((p) => p.alive).map((p) => p.id)
}

export function isAlive(view: AiView, id: PlayerId): boolean {
  return view.players.find((p) => p.id === id)?.alive ?? false
}

// 現在有効なCOをしている人（役職別）。
export function activeClaimants(view: AiView, role: RoleKey): PlayerId[] {
  return unique(view.coRecords.filter((c) => c.status === 'active' && c.claimedRole === role).map((c) => c.playerId))
}

// 撤回・変更済みを含め、一度でもその役職をCOした人（対抗の有無の判定用）。
function everClaimants(view: AiView, role: RoleKey): PlayerId[] {
  return unique(view.coRecords.filter((c) => c.claimedRole === role).map((c) => c.playerId))
}

// 初日からの単独CO者（方針A・5-4-5）。1日目は暫定白、2日目以降も対抗がなければ確定白。
// どちらの段階でも投票・護衛上は「確定役職者」として扱う。
export function singleCoHolders(view: AiView): Map<PlayerId, RoleKey> {
  const result = new Map<PlayerId, RoleKey>()
  for (const role of ['seer', 'medium', 'bodyguard'] as RoleKey[]) {
    const ever = everClaimants(view, role)
    const active = activeClaimants(view, role)
    if (ever.length !== 1 || active.length !== 1) continue
    const first = view.coRecords.filter((c) => c.playerId === active[0] && c.claimedRole === role).sort((a, b) => a.eventOrder - b.eventOrder)[0]
    if (first?.day !== 1) continue
    // 自分の実役職と矛盾するCOは真扱いしない（自分が本物ならその人は騙り）。
    if (view.selfRole === role && active[0] !== view.selfId) continue
    result.set(active[0], role)
  }
  return result
}

export type SeerClaim = { speakerId: PlayerId; targetId: PlayerId; result: 'wolf' | 'not-wolf'; targetDay: number; eventOrder: number }

// 現在有効な予言者CO者による予言結果の公表。
export function seerClaims(view: AiView): SeerClaim[] {
  const seers = new Set(activeClaimants(view, 'seer'))
  return view.resultClaims
    .filter((c) => c.kind === 'seer' && seers.has(c.speakerId) && c.result !== 'guarded')
    .map((c) => ({ speakerId: c.speakerId, targetId: c.targetId, result: c.result as 'wolf' | 'not-wolf', targetDay: c.targetDay, eventOrder: c.eventOrder }))
}

export function mediumClaims(view: AiView): SeerClaim[] {
  const mediums = new Set(activeClaimants(view, 'medium'))
  return view.resultClaims
    .filter((c) => c.kind === 'medium' && mediums.has(c.speakerId) && c.result !== 'guarded')
    .map((c) => ({ speakerId: c.speakerId, targetId: c.targetId, result: c.result as 'wolf' | 'not-wolf', targetDay: c.targetDay, eventOrder: c.eventOrder }))
}

// 公開情報上の確定霊媒師（初日からの単独CO霊媒師）。
export function confirmedMedium(view: AiView): PlayerId | null {
  for (const [id, role] of singleCoHolders(view)) if (role === 'medium') return id
  return null
}

export function confirmedSeer(view: AiView): PlayerId | null {
  for (const [id, role] of singleCoHolders(view)) if (role === 'seer') return id
  return null
}

export type Breakdown = { playerId: PlayerId; reason: string }

// 7-2 の破綻条件（公開情報のみ）。AI本人だけが知る偽物判定は含めない。
export function brokenPlayers(view: AiView): Breakdown[] {
  const result: Breakdown[] = []
  const seers = activeClaimants(view, 'seer')
  const claims = seerClaims(view)
  const cMedium = confirmedMedium(view)
  const cMediumClaims = cMedium ? mediumClaims(view).filter((c) => c.speakerId === cMedium) : []
  for (const s of seers) {
    const mine = claims.filter((c) => c.speakerId === s)
    const blacks = unique(mine.filter((c) => c.result === 'wolf').map((c) => c.targetId))
    const attacked = blacks.find((t) => view.players.find((p) => p.id === t)?.death?.cause === 'attack')
    if (attacked) {
      result.push({ playerId: s, reason: `A: 黒を出した${nameOf(view, attacked)}が襲撃死` })
      continue
    }
    if (blacks.length >= 4) {
      result.push({ playerId: s, reason: `B: 異なる${blacks.length}人へ黒` })
      continue
    }
    const contradicted = blacks.find((t) => cMediumClaims.some((m) => m.targetId === t && m.result === 'not-wolf'))
    if (contradicted) {
      result.push({ playerId: s, reason: `C: 黒を出した${nameOf(view, contradicted)}に確定霊媒師が白` })
      continue
    }
    if (seers.length >= 3) {
      const whitedSeers = unique(mine.filter((c) => c.result === 'not-wolf' && seers.includes(c.targetId) && c.targetId !== s).map((c) => c.targetId))
      if (whitedSeers.length >= 2) {
        result.push({ playerId: s, reason: 'D: 予言者3COで他の予言者2人へ白' })
        continue
      }
    }
    if (mine.some((c) => c.targetDay === 1 && c.result === 'wolf')) {
      result.push({ playerId: s, reason: 'E: 初日の予言結果として黒' })
    }
  }
  return result
}

// 確定白（5-4-5）。行動上の白扱いであり、真の配役の保証ではない。
export function confirmedWhites(view: AiView): Map<PlayerId, string> {
  const result = new Map<PlayerId, string>()
  const holders = singleCoHolders(view)
  for (const [id, role] of holders) {
    // 初日は「暫定白」。投票対象外という扱いは同じ（方針A）。
    result.set(id, view.day <= 1 ? `初日単独${roleLabel(role)}CO（暫定白）` : `初日から単独${roleLabel(role)}CO（確定白）`)
  }
  const seers = activeClaimants(view, 'seer')
  if (seers.length >= 2) {
    const claims = seerClaims(view)
    for (const p of view.players) {
      if (seers.every((s) => s !== p.id && claims.some((c) => c.speakerId === s && c.targetId === p.id && c.result === 'not-wolf'))) {
        result.set(p.id, '予言者CO者全員から白')
      }
    }
  }
  // 護衛成功通知のあった夜に狩人CO者が公表した護衛先。狩人CO者の主張が割れたら保留する。
  const guards = activeClaimants(view, 'bodyguard')
  for (const night of view.guardSuccessNights) {
    const claims = view.resultClaims.filter((c) => c.kind === 'guard' && guards.includes(c.speakerId) && c.announcedDay === night + 1)
    const targets = unique(claims.map((c) => c.targetId))
    if (targets.length === 1) result.set(targets[0], `${night}日目夜の護衛成功先`)
  }
  return result
}

// 処刑余裕数（方針C-2b）＝ floor((生存人数－1)÷2) － 推定残存人狼陣営の最大人数。
export function executionMargin(view: AiView): { margin: number; remainingEvil: number; explanation: string } {
  const alive = aliveIds(view).length
  const executed = view.players.filter((p) => p.death?.cause === 'execution').map((p) => p.id)
  const cMedium = confirmedMedium(view)
  const broken = new Set(brokenPlayers(view).map((b) => b.playerId))
  let confirmedEvilDead = 0
  for (const id of executed) {
    const own = view.ownMediumResults.find((r) => r.targetId === id)
    const publicMedium = cMedium ? mediumClaims(view).find((c) => c.speakerId === cMedium && c.targetId === id) : undefined
    const isWolf = own ? own.result === 'wolf' : publicMedium?.result === 'wolf'
    // 霊媒結果と破綻を二重加算しない。
    if (isWolf || broken.has(id)) confirmedEvilDead += 1
  }
  const remainingEvil = Math.max(0, MAX_EVIL - confirmedEvilDead)
  const base = Math.floor((alive - 1) / 2)
  const margin = base - remainingEvil
  return { margin, remainingEvil, explanation: `生存${alive}人 → 残り処刑${base}回 − 残存人外最大${remainingEvil}人 = 余裕${margin}` }
}

// 確定人狼（行動上）。自分の実際の結果、確定予言者の黒、予言者2COの両黒。
export function confirmedWolves(view: AiView): Map<PlayerId, string> {
  const result = new Map<PlayerId, string>()
  for (const r of view.ownSeerResults) if (r.result === 'wolf') result.set(r.targetId, '自分の予言で人狼')
  const ownWhite = new Set(ownKnownHumans(view))
  const claims = seerClaims(view)
  const cSeer = confirmedSeer(view)
  if (cSeer) {
    for (const c of claims) if (c.speakerId === cSeer && c.result === 'wolf' && !ownWhite.has(c.targetId) && !result.has(c.targetId)) result.set(c.targetId, '確定予言者の黒')
  }
  const seers = activeClaimants(view, 'seer')
  if (seers.length === 2) {
    for (const p of view.players) {
      if (seers.includes(p.id)) continue
      const both = seers.every((s) => claims.some((c) => c.speakerId === s && c.targetId === p.id && c.result === 'wolf'))
      if (both && !ownWhite.has(p.id) && !result.has(p.id)) result.set(p.id, '予言者2COの両黒')
    }
  }
  // 自分自身を人狼扱いすることはない（自分の実役職が絶対）。
  if (view.selfRole !== 'wolf') result.delete(view.selfId)
  return result
}

// 自分の実際の情報から人間と分かっている人。
export function ownKnownHumans(view: AiView): PlayerId[] {
  const ids = view.ownSeerResults.filter((r) => r.result === 'not-wolf').map((r) => r.targetId)
  if (view.selfRole !== 'wolf') ids.push(view.selfId)
  return unique(ids)
}

export type Roller = { role: 'medium' | 'seer'; targets: PlayerId[]; startedDay: number; basis: string }

// ローラーの認識（方針C-2c）。先行票の過半数が対象役職のCO者全体に入っていれば成立。
// 2日目以降に新しく始まったローラーには追従しないため、初日の通常投票（自分より前の票）でのみ開始を認識する。
export function detectRoller(view: AiView, currentRoundId: string | undefined): Roller | null {
  const day1 = view.voteRounds.find((r) => r.day === 1 && r.kind === 'normal')
  if (!day1) return null
  // 判断中のラウンドなら公開済みの票すべて、過去のラウンドなら自分の票より前の票で判定する。
  const own = day1.id === currentRoundId ? undefined : day1.votes.find((v) => v.voterId === view.selfId)
  const votes = own ? day1.votes.filter((v) => v.order < own.order) : day1.votes
  if (votes.length === 0) return null
  for (const [role, minCo] of [['medium', 2], ['seer', 3]] as const) {
    const claimants = everClaimantsAsOf(view, role, 1)
    if (claimants.length < minCo) continue
    const onClaimants = votes.filter((v) => claimants.includes(v.targetId)).length
    if (onClaimants * 2 > votes.length) {
      return { role, targets: claimants, startedDay: 1, basis: `初日の先行${votes.length}票中${onClaimants}票が${roleLabel(role)}CO者へ集中` }
    }
  }
  return null
}

function everClaimantsAsOf(view: AiView, role: RoleKey, day: number): PlayerId[] {
  return unique(view.coRecords.filter((c) => c.claimedRole === role && c.day <= day).map((c) => c.playerId))
}

// 当該ラウンドの公開済み得票数。
export function voteCounts(round: PublicVoteRound | undefined): Map<PlayerId, number> {
  const m = new Map<PlayerId, number>()
  for (const v of round?.votes ?? []) m.set(v.targetId, (m.get(v.targetId) ?? 0) + 1)
  return m
}

// 直近の昼の最終得票数（その日の最後の確定済みラウンド）。
export function lastDayFinalCounts(view: AiView): Map<PlayerId, number> {
  const resolved = view.voteRounds.filter((r) => r.resolved)
  return voteCounts(resolved[resolved.length - 1])
}

// 投票履歴による村人らしさの評価点（5-4-4a）。点を付けるのは投票者。
// adopted: 処刑者ごとに採用する霊媒結果。
export function villageScores(view: AiView, adopted: Map<PlayerId, 'wolf' | 'not-wolf'>): Map<PlayerId, number> {
  const scores = new Map<PlayerId, number>()
  for (const round of view.voteRounds) {
    if (!round.resolved) continue
    for (const v of round.votes) {
      const res = adopted.get(v.targetId)
      if (!res) continue // 未判定の投票先は保留
      const delta = round.kind === 'normal' ? (res === 'wolf' ? 20 : -10) : res === 'wolf' ? 5 : -3
      scores.set(v.voterId, (scores.get(v.voterId) ?? 0) + delta)
    }
  }
  return scores
}

// 評価点の採用霊媒結果：自分の実結果 → 確定霊媒師の公表 → 霊媒CO者全員が一致した公表。
export function adoptedMediumResults(view: AiView, overrides?: Map<PlayerId, 'wolf' | 'not-wolf'>): Map<PlayerId, 'wolf' | 'not-wolf'> {
  const result = new Map<PlayerId, 'wolf' | 'not-wolf'>()
  const claims = mediumClaims(view)
  const cMedium = confirmedMedium(view)
  const executed = view.players.filter((p) => p.death?.cause === 'execution').map((p) => p.id)
  for (const id of executed) {
    const own = view.ownMediumResults.find((r) => r.targetId === id)
    if (own) {
      result.set(id, own.result)
      continue
    }
    if (overrides?.has(id)) {
      result.set(id, overrides.get(id)!)
      continue
    }
    const forX = claims.filter((c) => c.targetId === id)
    const fromConfirmed = forX.find((c) => c.speakerId === cMedium)
    if (fromConfirmed) {
      result.set(id, fromConfirmed.result)
      continue
    }
    const results = unique(forX.map((c) => c.result))
    if (results.length === 1) result.set(id, results[0])
  }
  return result
}

export function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

export function nameOf(view: AiView, id: PlayerId): string {
  return view.players.find((p) => p.id === id)?.displayName ?? id
}

export function roleLabel(role: RoleKey): string {
  return { villager: '村人', wolf: '人狼', madman: '狂人', seer: '予言者', medium: '霊媒師', bodyguard: '狩人' }[role]
}

// 生存中の有効な人狼CO者を、実際のCO順（eventOrder）で並べる（11-1）。
// 撤回・死亡した人は除く。同じ人が複数回人狼COした場合は、現在有効なCOのうち最初のものを使う。
export function wolfCoOrder(view: AiView): PlayerId[] {
  const first = new Map<PlayerId, number>()
  for (const c of view.coRecords) {
    if (c.status !== 'active' || c.claimedRole !== 'wolf' || !isAlive(view, c.playerId)) continue
    first.set(c.playerId, Math.min(first.get(c.playerId) ?? Infinity, c.eventOrder))
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
}

// 追従対象者の参照できる票（11-1・11-5）。
// 通常投票：判断中のラウンドで公開済みの票。決選投票：同じ日の直前ラウンドの公開済みの票。
// 参照できる票がなければnull（11-5の未確定事項。呼び出し側で候補内ランダムとする暫定案）。
export function followeeVote(view: AiView, followeeId: PlayerId, roundId: string): PlayerId | null {
  const idx = view.voteRounds.findIndex((r) => r.id === roundId)
  if (idx < 0) return null
  const current = view.voteRounds[idx]
  let ref: PublicVoteRound | undefined = current
  if (current.kind !== 'normal') {
    ref = view.voteRounds
      .slice(0, idx)
      .reverse()
      .find((r) => r.day === current.day)
  }
  return ref?.votes.find((v) => v.voterId === followeeId)?.targetId ?? null
}

// 破綻が解除された人（7-4）。撤回・変更されたCOと公表結果も含めた「これまでの全主張」では
// 破綻条件に当たるが、現在の公表内容では当たらない生存者。村を混乱させた履歴として扱う。
// 撤回の時点は記録していないため、同時には存在しなかった主張を組み合わせて判定することがある（暫定）。
export function releasedBrokenPlayers(view: AiView): Breakdown[] {
  const everView: AiView = {
    ...view,
    coRecords: view.coRecords.map((c) => ({ ...c, status: 'active' as const })),
    resultClaims: [...view.resultClaims, ...view.retractedResultClaims],
  }
  const current = new Set(brokenPlayers(view).map((b) => b.playerId))
  return brokenPlayers(everView)
    .filter((b) => !current.has(b.playerId) && isAlive(view, b.playerId))
    .map((b) => ({ playerId: b.playerId, reason: `解除済み（${b.reason}）` }))
}
