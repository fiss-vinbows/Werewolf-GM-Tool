// AIの夜行動（仕様5-2・方針C-3・5-4-1・5-4-2）。ルールベースの純関数。
import type { PlayerId } from '../types'
import { activeClaimants, confirmedWhites, lastDayFinalCounts, nameOf, singleCoHolders } from './analysis'
import type { Rng } from './vote'
import type { AiView } from './view'

export const AI_NIGHT_POLICY_VERSION = 'night-rule-2'

export type NightDecisionResult = { targetId: PlayerId; reasons: string[] }

// 狩人AIの護衛方針。other=予言者・霊媒師以外の通常護衛、solid=堅実（役職者→確定白→低得票者）、throwaway=捨て護衛。
export type GuardMode = 'seer' | 'medium' | 'other' | 'solid' | 'throwaway'
export type GuardDecisionResult = NightDecisionResult & { mode: GuardMode }

const SPECIAL_ROLES = ['seer', 'medium', 'bodyguard'] as const

function aliveOthers(view: AiView): PlayerId[] {
  return view.players.filter((p) => p.alive && p.id !== view.selfId).map((p) => p.id)
}

function pickRandom(rng: Rng, ids: PlayerId[]): PlayerId {
  return ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))]
}

// 直近の昼の最終得票数が最少（low）／最多（high）の人。同数ならランダム。
function pickByVotes(view: AiView, rng: Rng, ids: PlayerId[], which: 'low' | 'high'): PlayerId {
  const counts = lastDayFinalCounts(view)
  const values = ids.map((id) => counts.get(id) ?? 0)
  const target = which === 'low' ? Math.min(...values) : Math.max(...values)
  return pickRandom(
    rng,
    ids.filter((_, i) => values[i] === target),
  )
}

// 予言対象の選択（方針C-3）。役職CO者と予言済みの人を除いてランダム。
export function decideSeerTarget(view: AiView, rng: Rng = Math.random): NightDecisionResult {
  const reasons: string[] = []
  const others = aliveOthers(view)
  if (others.length === 0) throw new Error('予言可能な対象がいません')
  const seen = new Set(view.ownSeerResults.map((r) => r.targetId))
  // 役職CO者に加え、自分で人狼・狂人を名乗った人も予言する必要が薄いので除外する（B-7、2026-10-04確定）。
  const coHolders = new Set([...SPECIAL_ROLES, 'wolf' as const, 'madman' as const].flatMap((r) => activeClaimants(view, r)))
  const normal = others.filter((id) => !seen.has(id) && !coHolders.has(id))
  if (normal.length > 0) {
    reasons.push(`役職CO者・人狼CO者・狂人CO者・予言済みを除く${normal.length}人からランダム`)
    const t = pickRandom(rng, normal)
    reasons.push(`→ ${nameOf(view, t)}`)
    return { targetId: t, reasons }
  }
  const unseenCo = others.filter((id) => !seen.has(id))
  if (unseenCo.length > 0) {
    reasons.push('通常候補がいないため、未予言の役職CO者からランダム')
    const t = pickRandom(rng, unseenCo)
    reasons.push(`→ ${nameOf(view, t)}`)
    return { targetId: t, reasons }
  }
  reasons.push('未予言の生存者がいないため、再予言（最後の選択肢）')
  const t = pickRandom(rng, others)
  reasons.push(`→ ${nameOf(view, t)}`)
  return { targetId: t, reasons }
}

// 狩人AIの護衛（5-4-1）。prevMode は前夜の自分の護衛方針（AI本人の記憶）。
export function decideGuardTarget(view: AiView, prevMode: GuardMode | null, rng: Rng = Math.random): GuardDecisionResult {
  const reasons: string[] = []
  const prev = [...view.ownGuardHistory].sort((a, b) => b.day - a.day)[0]
  const prevNight = prev && prev.day === view.day - 1 ? prev : undefined
  const legal = aliveOthers(view).filter((id) => id !== prevNight?.targetId)
  if (legal.length === 0) throw new Error('護衛可能な対象がいません')
  if (prevNight) reasons.push(`前夜の護衛先${nameOf(view, prevNight.targetId)}は連続護衛禁止`)

  const solid = (why: string): GuardDecisionResult => {
    reasons.push(why)
    const holders = [...singleCoHolders(view).keys()].filter((id) => legal.includes(id))
    if (holders.length > 0) return done(pickRandom(rng, holders), 'solid', '確定役職者を護衛')
    const whites = [...confirmedWhites(view).keys()].filter((id) => legal.includes(id))
    if (whites.length > 0) return done(pickRandom(rng, whites), 'solid', '確定白を護衛')
    return done(pickByVotes(view, rng, legal, 'low'), 'solid', '役職者・確定白に護衛可能な人がいないため、直近の最終得票が少ない人を護衛')
  }
  const throwaway = (why: string): GuardDecisionResult => {
    reasons.push(why)
    return done(pickByVotes(view, rng, legal, 'high'), 'throwaway', '捨て護衛：直近の最終得票が多い人を護衛')
  }
  const done = (targetId: PlayerId, mode: GuardMode, why: string): GuardDecisionResult => {
    reasons.push(`${why} → ${nameOf(view, targetId)}`)
    return { targetId, mode, reasons }
  }

  // 捨て護衛の翌夜は成功・失敗を問わず役職者を優先し、連続の捨て護衛はしない。
  if (prevMode === 'throwaway') return solid('前夜は捨て護衛だったため、堅実に護衛')
  // 「その他」の翌夜は、確定役職者を守る方針と捨て護衛を各50％。
  if (prevMode === 'other') return rng() < 0.5 ? solid('前夜が「その他」のため50％抽選 → 堅実') : throwaway('前夜が「その他」のため50％抽選 → 捨て護衛')

  // 通常：予言者・霊媒師・その他の区分を等確率で選ぶ（候補がいない区分は除外）。
  const seers = activeClaimants(view, 'seer').filter((id) => legal.includes(id))
  const mediums = activeClaimants(view, 'medium').filter((id) => legal.includes(id))
  const others = legal.filter((id) => !seers.includes(id) && !mediums.includes(id))
  const categories: [GuardMode, PlayerId[], string][] = (
    [
      ['seer', seers, '予言者'],
      ['medium', mediums, '霊媒師'],
      ['other', others, 'その他'],
    ] as [GuardMode, PlayerId[], string][]
  ).filter(([, ids]) => ids.length > 0)
  const [mode, ids, label] = categories[Math.min(categories.length - 1, Math.floor(rng() * categories.length))]
  reasons.push(`区分抽選（${categories.map((c) => c[2]).join('・')}から等確率）→ ${label}`)
  return done(pickRandom(rng, ids), mode, `${label}区分からランダム`)
}

// 人狼AIの襲撃（5-4-2）。人間の仲間が生きている間は仲間の決定に従うため、ここはAIが自分で決める場合のみ使う。
export function decideWolfAttack(view: AiView, rng: Rng = Math.random): NightDecisionResult {
  const reasons: string[] = []
  const wolves = new Set([view.selfId, ...view.wolfMateIds])
  const legal = view.players.filter((p) => p.alive && !wolves.has(p.id)).map((p) => p.id)
  if (legal.length === 0) throw new Error('襲撃可能な対象がいません')
  const aliveCount = view.players.filter((p) => p.alive).length
  const done = (targetId: PlayerId, why: string): NightDecisionResult => {
    reasons.push(`${why} → ${nameOf(view, targetId)}`)
    return { targetId, reasons }
  }
  const guards = activeClaimants(view, 'bodyguard').filter((id) => legal.includes(id))
  if (guards.length > 0 && aliveCount % 2 === 0) return done(pickRandom(rng, guards), `生存${aliveCount}人（偶数）のため狩人CO者を最優先`)
  const holders = [...singleCoHolders(view).keys()].filter((id) => legal.includes(id))
  const holdersWithGuards = [...new Set([...holders, ...guards])]
  if (holdersWithGuards.length > 0) return done(pickRandom(rng, holdersWithGuards), '確定役職者を襲撃')
  const whites = [...confirmedWhites(view).keys()].filter((id) => legal.includes(id))
  if (whites.length > 0) return done(pickRandom(rng, whites), '確定白を襲撃')
  return done(pickByVotes(view, rng, legal, 'low'), '直近の最終得票が少ない（疑われていなそうな）人を襲撃')
}
