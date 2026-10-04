// AIの投票先決定（仕様5-3・5-4・7-3・4-4-2）。ルールベースの純関数。
import type { PlayerId, VoteRoundKind } from '../types'
import {
  activeClaimants,
  adoptedMediumResults,
  brokenPlayers,
  confirmedWhites,
  confirmedWolves,
  detectRoller,
  executionMargin,
  followeeVote,
  isAlive,
  mediumClaims,
  releasedBrokenPlayers,
  nameOf,
  ownKnownHumans,
  roleLabel,
  seerClaims,
  singleCoHolders,
  unique,
  villageScores,
  voteCounts,
  wolfCoOrder,
} from './analysis'
import type { AiView } from './view'

// 判断方式の版。方針を変えたら上げる（判断履歴の振り返り用）。
export const AI_VOTE_POLICY_VERSION = 'vote-rule-10'

// 0以上1未満の乱数を返す関数。テストでは固定値を注入する。
export type Rng = () => number

export type VoteDecisionResult = {
  targetId: PlayerId
  reasons: string[]
}

export type VoteRoundInput = { id: string; kind: VoteRoundKind; candidateIds: PlayerId[] }

function previousRoundOfDay(view: AiView, roundId: string) {
  const idx = view.voteRounds.findIndex((r) => r.id === roundId)
  if (idx < 0) return undefined
  const day = view.voteRounds[idx].day
  return view.voteRounds
    .slice(0, idx)
    .reverse()
    .find((r) => r.day === day)
}

export function decideVote(view: AiView, round: VoteRoundInput, rng: Rng = Math.random): VoteDecisionResult {
  const reasons: string[] = []
  const legal =
    round.kind === 'normal'
      ? view.players.filter((p) => p.alive && p.id !== view.selfId).map((p) => p.id)
      : round.candidateIds.filter((id) => id !== view.selfId && isAlive(view, id))
  if (legal.length === 0) throw new Error('投票可能な対象がいません')
  // 決選投票では当該ラウンドの票が見えないため、同じ日の直前ラウンドの公開済み得票を
  // 「先行票」の代わりに使う（C-7、2026-10-04確定）。
  const counts = voteCounts(round.kind === 'normal' ? view.voteRounds.find((r) => r.id === round.id) : previousRoundOfDay(view, round.id))
  if (round.kind !== 'normal') reasons.push('決選のため、先行票の代わりに直前ラウンドの公開済み得票を使用')
  const ctx: Ctx = { view, round, legal, counts, rng, reasons }

  const { margin, explanation } = executionMargin(view)
  reasons.push(`処刑余裕数: ${explanation}`)

  switch (view.selfRole) {
    case 'wolf':
      return decideWolf(ctx)
    case 'madman':
      return decideMadman(ctx)
    default:
      return decideVillageSide(ctx, margin)
  }
}

type Ctx = {
  view: AiView
  round: VoteRoundInput
  legal: PlayerId[]
  counts: Map<PlayerId, number>
  rng: Rng
  reasons: string[]
}

function decideVillageSide(ctx: Ctx, margin: number): VoteDecisionResult {
  const { view, legal, reasons } = ctx
  const ownHumans = new Set(ownKnownHumans(view))
  const whites = confirmedWhites(view)
  const wolves = confirmedWolves(view)
  const ownWolfIds = new Set(view.ownSeerResults.filter((r) => r.result === 'wolf').map((r) => r.targetId))

  // 投票対象外：自分の実際の人間結果、確定白（自分の人狼結果が優先）。
  const excluded = new Map<PlayerId, string>()
  for (const id of ownHumans) excluded.set(id, id === view.selfId ? '自分' : '自分の予言で人間')
  for (const [id, why] of whites) if (!ownWolfIds.has(id)) excluded.set(id, why)
  // 真の予言者・霊媒師AIは、対抗の騙りを基本的に放置する（方針B・5-4-4）。
  if (view.selfRole === 'seer' || view.selfRole === 'medium') {
    for (const id of activeClaimants(view, view.selfRole)) if (id !== view.selfId && !ownWolfIds.has(id)) excluded.set(id, `${roleLabel(view.selfRole)}の騙り（放置）`)
  }
  const allowed = legal.filter((id) => !excluded.has(id))
  const excludedHere = legal.filter((id) => excluded.has(id))
  if (excludedHere.length > 0) reasons.push(`投票対象外: ${excludedHere.map((id) => `${nameOf(view, id)}（${excluded.get(id)}）`).join('、')}`)

  if (allowed.length === 0) return forcedVillage(ctx)

  // 0. 人狼CO者に先行票があれば、確定人狼より優先して合わせる（票を散らさないため、2026-10-04確定）。
  // 先行票がなければ、下の確定人狼 → 人狼CO者… の本来の順に従う。
  {
    const wolfCos = wolfCoOrder(view).filter((id) => allowed.includes(id) && (ctx.counts.get(id) ?? 0) > 0)
    if (wolfCos.length > 0) {
      const max = Math.max(...wolfCos.map((id) => ctx.counts.get(id) ?? 0))
      const t = wolfCos.find((id) => (ctx.counts.get(id) ?? 0) === max)!
      return pick(ctx, t, '人狼CO者に先行票があるため、票を散らさないよう合わせる（11-6）')
    }
  }

  // 1. 確定人狼（自分の人狼結果を最優先。途中得票0でも投票する）。
  const ownWolfTargets = allowed.filter((id) => ownWolfIds.has(id))
  if (ownWolfTargets.length > 0) return pick(ctx, pickMost(ctx, ownWolfTargets), '自分の予言で人狼と判定した相手へ継続投票（方針C）')
  const cwTargets = allowed.filter((id) => wolves.has(id))
  if (cwTargets.length > 0) {
    const t = pickMost(ctx, cwTargets)
    return pick(ctx, t, `確定人狼扱い（${wolves.get(t)}）へ投票`)
  }

  // 1b. パワープレイへの対応（11-6）。村人陣営AI全員（村人・予言者・霊媒師・狩人）に適用する。
  // 優先順位は「確定人狼の次・破綻者の前」（2026-10-04確定）。
  // 方針：村人陣営が負けないことを最優先し、票を合わせて勝率を下げないようにする。
  // 人間の票が散って合わせ先がない場合は、本来の条件に従う。
  {
    const pp = decideVillagerAgainstPp(ctx, allowed)
    if (pp) return pp
  }

  // 2. 破綻者（死票を避けるため既得票者を優先）。
  const broken = brokenPlayers(view).filter((b) => allowed.includes(b.playerId))
  if (broken.length > 0) {
    const withVotes = broken.filter((b) => (ctx.counts.get(b.playerId) ?? 0) > 0).map((b) => b.playerId)
    if (withVotes.length > 0) {
      const t = pickMost(ctx, withVotes)
      return pick(ctx, t, `破綻者へ投票（${broken.find((b) => b.playerId === t)!.reason}）`)
    }
    reasons.push(`破綻者（${broken.map((b) => nameOf(view, b.playerId)).join('、')}）は全員0票のため、破綻者以外も含めてランダム（7-3）`)
    return pick(ctx, pickRandom(ctx, allowed), 'ランダム投票')
  }

  // 3. 初日から継続中のローラーと、解除済みの破綻者（7-4）。
  // 両方いれば当該ラウンドの個人別得票が多い人へ投票し、同数ならランダム。
  const released = releasedBrokenPlayers(view).filter((b) => allowed.includes(b.playerId))
  const releasedIds = released.map((b) => b.playerId)
  if (released.length > 0) reasons.push(`解除済みの破綻者: ${released.map((b) => `${nameOf(view, b.playerId)}（${b.reason}）`).join('、')}`)
  const roller = detectRoller(view, ctx.round.id)
  const rollerTargets = roller ? roller.targets.filter((id) => allowed.includes(id)) : []
  if (rollerTargets.length > 0) {
    reasons.push(`${roleLabel(roller!.role)}ローラーを認識（${roller!.basis}）`)
    const pool = unique([...rollerTargets, ...releasedIds])
    const t = pickMost(ctx, pool)
    return pick(ctx, t, releasedIds.length > 0 ? 'ローラー対象と解除済みの破綻者のうち票の多い人へ重ねる（7-4）' : 'ローラー対象のうち票の多い人へ重ねる')
  }
  // ローラーがない場合は先行票に重ねず、下の重み付きランダムで選ばれやすさを2倍にする（2026-10-04確定）。

  // 4. 予言者2CO以上の片黒。
  const seers = activeClaimants(view, 'seer')
  if (seers.length >= 2) {
    const blacks = seerClaims(view).filter((c) => c.result === 'wolf' && isAlive(view, c.targetId) && !ownHumans.has(c.targetId))
    if (margin > 0) {
      const targets = unique(blacks.map((c) => c.targetId)).filter((id) => allowed.includes(id))
      if (targets.length > 0) {
        const t = pickMost(ctx, targets)
        return pick(ctx, t, `予言者CO者の人狼判定に従う（余裕あり）: ${nameOf(view, t)}`)
      }
    } else {
      const pair = unique(blacks.flatMap((c) => [c.speakerId, c.targetId])).filter((id) => allowed.includes(id))
      if (pair.length > 0) return pick(ctx, pickRandom(ctx, pair), '余裕なしのため、人狼判定を出した人と出された人からランダム')
    }
  }

  // 5. 霊媒師2COで結果が割れた場合（方針C-2a）。
  let overrides: Map<PlayerId, 'wolf' | 'not-wolf'> | undefined
  const mediums = activeClaimants(view, 'medium')
  if (mediums.length === 2 && view.selfRole !== 'medium') {
    const claims = mediumClaims(view)
    // 結果が割れた処刑者が複数いる場合は、すべての割れを平等に扱う（C-2、2026-10-04確定）。
    const splits = findMediumSplits(claims, mediums)
    if (splits.length > 0) {
      const mediumPair = mediums.filter((id) => allowed.includes(id))
      if (margin <= 0 && mediumPair.length > 0) return pick(ctx, pickRandom(ctx, mediumPair), '余裕なしのため霊媒師CO者2人からランダム（決め打ち）')
      const blackSpeakers = unique(splits.map((x) => x.blackSpeaker)).filter((id) => allowed.includes(id) && (ctx.counts.get(id) ?? 0) > 0)
      if (blackSpeakers.length > 0) {
        const t = pickMost(ctx, blackSpeakers)
        return pick(ctx, t, `霊媒結果が割れ、黒を出した${nameOf(view, t)}に先行票があるため重ねる`)
      }
      overrides = new Map(splits.map((x) => [x.executedId, 'not-wolf' as const]))
      reasons.push(`霊媒結果が割れたため、人間結果を基に評価（${splits.map((x) => `${nameOf(view, x.executedId)}は${nameOf(view, x.whiteSpeaker)}の結果`).join('、')}）`)
    }
  }

  // 6. 投票履歴による評価点で重み付きランダム（低いほど選ばれやすい）。
  const scores = villageScores(view, adoptedMediumResults(view, overrides))
  const scored = allowed.filter((id) => scores.has(id))
  if (scored.length > 0) reasons.push(`評価点: ${allowed.map((id) => `${nameOf(view, id)} ${scores.get(id) ?? 0}`).join('、')}`)
  // 解除済みの破綻者は、村を混乱させた履歴として選ばれやすさを2倍にする（7-4、2026-10-04確定）。
  const releasedSet = new Set(releasedIds)
  const t = weightedPick(ctx, allowed, (id) => Math.pow(2, -(scores.get(id) ?? 0) / 20) * (releasedSet.has(id) ? 2 : 1))
  return pick(ctx, t, scored.length > 0 ? '評価点による重み付きランダム' : 'ランダム投票')
}

// 決選投票で全員が投票対象外になった場合、または通常投票で候補が0人の場合（4-4-2・5-5）。
function forcedVillage(ctx: Ctx): VoteDecisionResult {
  const holders = singleCoHolders(ctx.view)
  const nonHolders = ctx.legal.filter((id) => !holders.has(id))
  const pool = nonHolders.length > 0 ? nonHolders : ctx.legal
  ctx.reasons.push('投票可能な候補が全員投票対象外のため、例外として除外を解除')
  if (nonHolders.length > 0 && nonHolders.length < ctx.legal.length) ctx.reasons.push('役職者を保護し、役職者でない候補を選ぶ')
  return pick(ctx, pickRandom(ctx, pool), 'ランダム投票（強制）')
}

function decideWolf(ctx: Ctx): VoteDecisionResult {
  const { view } = ctx
  const mates = new Set(view.wolfMateIds)
  const allowed = ctx.legal.filter((id) => !mates.has(id))

  // 仲間の人狼が人狼COしていれば、パワープレイとしてその仲間の票に合わせる（11-4・11-5）。
  // 複数の仲間が人狼COした場合は、最初にCOした仲間を追従する（2026-10-04確定）。
  const followee = wolfCoOrder(view).find((id) => mates.has(id))
  if (followee) {
    ctx.reasons.push(`仲間の${nameOf(view, followee)}が人狼CO（パワープレイの可能性が高い）`)
    const target = followeeVote(view, followee, ctx.round.id)
    // 仲間が別の仲間に投票していても追従する（通常の仲間保護の例外）。
    if (target && ctx.legal.includes(target)) return pick(ctx, target, `人狼COした仲間${nameOf(view, followee)}の投票先に追従`)
    ctx.reasons.push(target ? '追従先が今回の候補にいないため、候補内からランダム' : `${nameOf(view, followee)}の投票を認識できないため、仲間を除いてランダム`)
  }

  if (allowed.length === 0) {
    ctx.reasons.push('候補が全員仲間の人狼のため、決選の強制投票として例外的に投票')
    return pick(ctx, pickRandom(ctx, ctx.legal), 'ランダム投票（強制）')
  }
  if (allowed.length < ctx.legal.length) ctx.reasons.push('仲間の人狼を投票対象外')
  // 仲間以外の破綻者に先行票があれば重ね、村の投票にまぎれる（C-8、2026-10-04確定）。
  const broken = brokenPlayers(view).filter((b) => allowed.includes(b.playerId) && (ctx.counts.get(b.playerId) ?? 0) > 0)
  if (broken.length > 0) {
    const t = pickMost(ctx, broken.map((b) => b.playerId))
    return pick(ctx, t, `仲間以外の破綻者（${broken.find((b) => b.playerId === t)!.reason}）に先行票があるため重ねる（C-8）`)
  }
  const roll = joinRoller(ctx, allowed)
  if (roll) return roll
  return pick(ctx, pickRandom(ctx, allowed), followee ? 'ランダム投票（11-4）' : 'ランダム投票（方針C-2）')
}

// 狂人AIの人狼扱い（5-4-3）。
function decideMadman(ctx: Ctx): VoteDecisionResult {
  const { view } = ctx
  const treated = new Map<PlayerId, string>()
  const seers = activeClaimants(view, 'seer')
  for (const c of seerClaims(view)) {
    if (c.targetId === view.selfId && c.result === 'wolf') treated.set(c.speakerId, '自分（狂人）に人狼結果を出した予言者CO者')
    if (c.result === 'not-wolf' && seers.includes(c.targetId) && c.targetId !== c.speakerId) treated.set(c.speakerId, '別の予言者CO者に人間結果を出した予言者CO者')
  }
  for (const b of brokenPlayers(view)) if (!treated.has(b.playerId)) treated.set(b.playerId, `破綻者（${b.reason}）`)

  // パワープレイの追従モード（11-2・11-5）。生存する有効な人狼CO者がいる限り、最初にCOした人に合わせる。
  const wolfCos = wolfCoOrder(view)
  if (wolfCos.length > 0) {
    const followee = wolfCos[0]
    ctx.reasons.push(`追従モード: 最初の人狼CO者${nameOf(view, followee)}を信用`)
    const target = followeeVote(view, followee, ctx.round.id)
    // 人狼CO者・人狼扱いの人への票でも追従する。追従先が自分なら下のランダムへ。
    if (target && target !== view.selfId && ctx.legal.includes(target)) return pick(ctx, target, `${nameOf(view, followee)}の投票先に追従`)
    ctx.reasons.push(
      target === view.selfId
        ? '追従先が自分のため、人狼CO者・人狼扱いの人を除いてランダム'
        : target
          ? '追従先が今回の候補にいないため、候補内からランダム'
          : `${nameOf(view, followee)}の投票を認識できないため、人狼CO者・人狼扱いの人を除いてランダム`,
    )
    for (const id of wolfCos) if (!treated.has(id)) treated.set(id, '人狼CO者')
  }

  const allowed = ctx.legal.filter((id) => !treated.has(id))
  const excludedHere = ctx.legal.filter((id) => treated.has(id))
  if (excludedHere.length > 0) ctx.reasons.push(`人狼扱いで投票対象外: ${excludedHere.map((id) => `${nameOf(view, id)}（${treated.get(id)}）`).join('、')}`)
  if (allowed.length === 0) {
    ctx.reasons.push('候補が全員人狼扱いのため、例外として除外を解除')
    return pick(ctx, pickRandom(ctx, ctx.legal), 'ランダム投票（強制）')
  }
  const roll = joinRoller(ctx, allowed)
  if (roll) return roll
  return pick(ctx, pickRandom(ctx, allowed), 'ランダム投票（5-4-3）')
}

// 村人AIの人狼CO・狂人COへの対応（11-6）。裏読みはせず、該当がなければnullを返して通常判断へ。
function decideVillagerAgainstPp(ctx: Ctx, allowed: PlayerId[]): VoteDecisionResult | null {
  const { view } = ctx
  // 人狼CO者には投票する。票が散ると負ける恐れがあるため、複数いれば当該ラウンドで
  // 票の多い人に合わせる。同数（全員0票を含む）なら最初にCOした人（2026-10-04確定）。
  const wolfCos = wolfCoOrder(view).filter((id) => allowed.includes(id))
  if (wolfCos.length > 0) {
    const max = Math.max(...wolfCos.map((id) => ctx.counts.get(id) ?? 0))
    const t = wolfCos.find((id) => (ctx.counts.get(id) ?? 0) === max)!
    return pick(ctx, t, wolfCos.length > 1 ? '人狼CO者のうち票の多い人へ合わせる（同数なら最初にCOした人）（11-6）' : '人狼CO者へ投票（11-6）')
  }
  // 狂人CO者：自分より前の票が1票以上あれば重ね、なければランダム。
  const madCos = activeClaimants(view, 'madman').filter((id) => allowed.includes(id))
  if (madCos.length === 0) return null
  const withVotes = madCos.filter((id) => (ctx.counts.get(id) ?? 0) > 0)
  if (withVotes.length > 0) return pick(ctx, pickMost(ctx, withVotes), '狂人CO者に先行票があるため重ねる（11-6）')
  ctx.reasons.push(`狂人CO者（${madCos.map((id) => nameOf(view, id)).join('、')}）に先行票がないため、ランダム（11-6）`)
  return pick(ctx, pickRandom(ctx, allowed), 'ランダム投票')
}

function findMediumSplits(claims: ReturnType<typeof mediumClaims>, mediums: PlayerId[]): { executedId: PlayerId; blackSpeaker: PlayerId; whiteSpeaker: PlayerId }[] {
  const [a, b] = mediums
  const result: { executedId: PlayerId; blackSpeaker: PlayerId; whiteSpeaker: PlayerId }[] = []
  for (const ca of claims.filter((c) => c.speakerId === a)) {
    const cb = claims.find((c) => c.speakerId === b && c.targetId === ca.targetId)
    if (!cb || cb.result === ca.result || result.some((x) => x.executedId === ca.targetId)) continue
    result.push(ca.result === 'wolf' ? { executedId: ca.targetId, blackSpeaker: a, whiteSpeaker: b } : { executedId: ca.targetId, blackSpeaker: b, whiteSpeaker: a })
  }
  return result
}

// 人狼AI・狂人AIのローラー参加（C-4、2026-10-04確定）。除外する人を除いたローラー対象のうち票の多い人へ重ねる。
function joinRoller(ctx: Ctx, allowed: PlayerId[]): VoteDecisionResult | null {
  const roller = detectRoller(ctx.view, ctx.round.id)
  if (!roller) return null
  const targets = roller.targets.filter((id) => allowed.includes(id))
  if (targets.length === 0) return null
  ctx.reasons.push(`${roleLabel(roller.role)}ローラーを認識（${roller.basis}）`)
  return pick(ctx, pickMost(ctx, targets), 'ローラー対象のうち票の多い人へ重ねる（C-4）')
}

function pick(ctx: Ctx, targetId: PlayerId, reason: string): VoteDecisionResult {
  ctx.reasons.push(`${reason} → ${nameOf(ctx.view, targetId)}`)
  return { targetId, reasons: ctx.reasons }
}

function pickRandom(ctx: Ctx, ids: PlayerId[]): PlayerId {
  return ids[Math.min(ids.length - 1, Math.floor(ctx.rng() * ids.length))]
}

// 現時点の得票が最も多い人。同数ならランダム。
function pickMost(ctx: Ctx, ids: PlayerId[]): PlayerId {
  const max = Math.max(...ids.map((id) => ctx.counts.get(id) ?? 0))
  return pickRandom(
    ctx,
    ids.filter((id) => (ctx.counts.get(id) ?? 0) === max),
  )
}

function weightedPick(ctx: Ctx, ids: PlayerId[], weight: (id: PlayerId) => number): PlayerId {
  const ws = ids.map(weight)
  const total = ws.reduce((a, b) => a + b, 0)
  let r = ctx.rng() * total
  for (let i = 0; i < ids.length; i++) {
    r -= ws[i]
    if (r < 0) return ids[i]
  }
  return ids[ids.length - 1]
}

// 通常投票のAI中央順（方針D）。奇数なら(N+1)/2番目、偶数ならN/2かN/2+1番目をランダムに1度だけ抽選。
export function centralVoteOrder(voterCount: number, rng: Rng = Math.random): number {
  if (voterCount <= 0) return 1
  if (voterCount % 2 === 1) return (voterCount + 1) / 2
  return voterCount / 2 + (rng() < 0.5 ? 0 : 1)
}
