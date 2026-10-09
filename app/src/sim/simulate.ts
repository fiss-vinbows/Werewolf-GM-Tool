// 全員AIでの自動対局シミュレーション（AIのパラメータ調整用。アプリ本体からは使わない）。
// AIは仕様上COも結果公表もしないため、COと公表だけは「人間を真似る簡易モデル」で行い、
// 投票・予言・護衛・襲撃の判断はアプリと同じAIロジック（domain/ai）を使う。
import { createInitialGameState } from '../domain/factory'
import type { CoRecord, GameState, NightRecord, PlayerId, ResultClaim, RoleKey, Vote, VoteRound, VoteRoundKind } from '../domain/types'
import { buildAiView } from '../domain/ai/view'
import { decideVote, type Rng } from '../domain/ai/vote'
import { decideGuardTarget, decideSeerTarget, decideWolfAttack, type GuardMode } from '../domain/ai/night'
import type { AiParams } from '../domain/ai/params'

// 騙りの型。真の予言者・霊媒師は常に初日にCOして正直に公表し、狩人は潜伏する。
export type FakePattern =
  | 'madSeer' // 狂人が予言者を騙る（予言者2CO・霊媒師1CO）
  | 'wolfSeer' // 人狼が予言者を騙る（予言者2CO・霊媒師1CO）
  | 'madSeerWolfMedium' // 狂人が予言者、人狼が霊媒師を騙る（予言者2CO・霊媒師2CO）
  | 'madWolfSeer' // 狂人と人狼が予言者を騙る（予言者3CO・霊媒師1CO）
  | 'noFake' // 騙りなし（予言者1CO・霊媒師1CO）

export const FAKE_PATTERNS: FakePattern[] = ['madSeer', 'wolfSeer', 'madSeerWolfMedium', 'madWolfSeer', 'noFake']

// game：終了時点の対局記録（CSV書き出しなどの確認用）。
export type SimResult = { winner: 'village' | 'wolf' | 'draw'; days: number; pattern: FakePattern; game: GameState }

// 再現性のある乱数（mulberry32）。
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROLES: RoleKey[] = ['wolf', 'wolf', 'wolf', 'madman', 'seer', 'medium', 'bodyguard', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']
// 騙り役の黒出しの確率（偽の予言者が黒を出す割合）。
const FAKE_BLACK_RATE = 0.3
const MAX_DAYS = 20

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const pickOne = <T>(xs: T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]

// log を渡すと、1ゲームの流れ（公表・投票理由・処刑・夜行動）を書き出す（確認用）。
export function simulateGame(params: AiParams, pattern: FakePattern, rng: Rng, log?: (line: string) => void): SimResult {
  const g: GameState = createInitialGameState()
  const roles = shuffle(ROLES, rng)
  g.players = g.players.map((p, i) => ({ ...p, isAi: true, actualRole: roles[i], alive: true, death: null }))
  g.phase = 'day'
  g.day = 1
  const ids = g.players.map((p) => p.id)
  const roleOf = (id: PlayerId) => g.players.find((p) => p.id === id)!.actualRole!
  const alive = (id: PlayerId) => g.players.find((p) => p.id === id)!.alive
  const byRole = (r: RoleKey) => ids.filter((id) => roleOf(id) === r)
  const wolves = byRole('wolf')
  const seer = byRole('seer')[0]
  const medium = byRole('medium')[0]
  const madman = byRole('madman')[0]
  const bodyguard = byRole('bodyguard')[0]
  // 初日白：人狼と予言者以外から抽選。
  g.day1WhiteNotice = pickOne(ids.filter((id) => roleOf(id) !== 'wolf' && id !== seer), rng)

  // 騙り役の割り当て。
  const fakeSeers: PlayerId[] = []
  let fakeMedium: PlayerId | null = null
  const fakeWolfSeer = pickOne(wolves, rng)
  if (pattern === 'madSeer' || pattern === 'madSeerWolfMedium' || pattern === 'madWolfSeer') fakeSeers.push(madman)
  if (pattern === 'wolfSeer' || pattern === 'madWolfSeer') fakeSeers.push(fakeWolfSeer)
  if (pattern === 'madSeerWolfMedium') fakeMedium = pickOne(wolves, rng)

  const nextOrder = () => ++g.eventCounter
  const coIdOf = new Map<PlayerId, string>()
  const co = (playerId: PlayerId, role: RoleKey) => {
    const rec: CoRecord = { id: `co-${playerId}`, eventOrder: nextOrder(), day: 1, claimedRole: role, playerId, recordedAt: '', status: 'active', supersedes: null, note: '', afterVoteCount: null }
    g.coRecords.push(rec)
    coIdOf.set(playerId, rec.id)
  }
  const claim = (speakerId: PlayerId, kind: 'seer' | 'medium', targetId: PlayerId, targetDay: number, result: 'wolf' | 'not-wolf') => {
    const c: ResultClaim = { id: `c${g.eventCounter + 1}`, eventOrder: nextOrder(), coId: coIdOf.get(speakerId) ?? '', kind, speakerId, targetId, targetDay, announcedDay: g.day, result, recordedAt: '', retracted: false }
    g.resultClaims.push(c)
    log?.(`  公表 ${speakerId}(${roleOf(speakerId)}) ${kind}: ${targetId}(${roleOf(targetId)}) → ${result}`)
  }

  // 初日のCO（順番はランダム）。
  const seerCos = shuffle([seer, ...fakeSeers], rng)
  const mediumCos = shuffle(fakeMedium ? [medium, fakeMedium] : [medium], rng)
  for (const id of seerCos) co(id, 'seer')
  for (const id of mediumCos) co(id, 'medium')

  const claimants = new Set([...seerCos, ...mediumCos])
  const announced = new Map<PlayerId, Set<PlayerId>>()
  const seerResultOf = new Map<number, { targetId: PlayerId; result: 'wolf' | 'not-wolf' }>()
  const mediumResultOf = new Map<number, { targetId: PlayerId; result: 'wolf' | 'not-wolf' }>()
  let prevGuardMode: GuardMode | null = null
  // 狩人の実際の護衛履歴（COしたときに○・Gとして発表する）。
  const guardHistory: { night: number; targetId: PlayerId; success: boolean }[] = []
  let bodyguardCoed = false
  // 狩人は処刑されそうになったらCOし、これまでの護衛先を発表する（ユーザーの卓の傾向、2026-10-09）。
  const bodyguardCo = (afterVoteCount: number | null) => {
    if (bodyguardCoed || !alive(bodyguard)) return
    bodyguardCoed = true
    const rec: CoRecord = { id: `co-${bodyguard}`, eventOrder: nextOrder(), day: g.day, claimedRole: 'bodyguard', playerId: bodyguard, recordedAt: '', status: 'active', supersedes: null, note: '', afterVoteCount }
    g.coRecords.push(rec)
    coIdOf.set(bodyguard, rec.id)
    claimants.add(bodyguard)
    log?.(`  狩人CO ${bodyguard}`)
    guardHistory.forEach((h, i) => {
      const c: ResultClaim = { id: `c${g.eventCounter + 1}`, eventOrder: nextOrder(), coId: rec.id, kind: 'guard', speakerId: bodyguard, targetId: h.targetId, targetDay: i + 1, announcedDay: g.day, result: h.success ? 'guard-success' : 'guarded', recordedAt: '', retracted: false }
      g.resultClaims.push(c)
    })
  }

  // 朝の結果公表。
  const announce = () => {
    const d = g.day
    if (alive(seer)) {
      if (d === 1) claim(seer, 'seer', g.day1WhiteNotice!, 1, 'not-wolf')
      else {
        const r = seerResultOf.get(d - 1)
        if (r) claim(seer, 'seer', r.targetId, d, r.result)
      }
    }
    if (alive(medium) && d >= 2) {
      const r = mediumResultOf.get(d - 1)
      if (r) claim(medium, 'medium', r.targetId, d - 1, r.result)
    }
    for (const f of fakeSeers) {
      if (!alive(f)) continue
      const done = announced.get(f) ?? new Set<PlayerId>()
      announced.set(f, done)
      const isWolf = roleOf(f) === 'wolf'
      const pool = ids.filter((id) => id !== f && alive(id) && !done.has(id) && !claimants.has(id))
      if (pool.length === 0) continue
      // 初日は白だけ（初日の黒は即破綻するため）。人狼の騙りは仲間に黒を出さない。
      const black = d >= 2 && rng() < FAKE_BLACK_RATE
      const blackPool = pool.filter((id) => !(isWolf && roleOf(id) === 'wolf'))
      const target = black && blackPool.length > 0 ? pickOne(blackPool, rng) : pickOne(pool, rng)
      done.add(target)
      claim(f, 'seer', target, d, black && blackPool.includes(target) ? 'wolf' : 'not-wolf')
    }
    if (fakeMedium && alive(fakeMedium) && d >= 2) {
      const r = mediumResultOf.get(d - 1)
      if (r) {
        // 人狼の偽霊媒師：仲間の処刑は白と偽り、それ以外は一部を黒と偽る。
        const res = roleOf(r.targetId) === 'wolf' ? 'not-wolf' : rng() < 0.25 ? 'wolf' : 'not-wolf'
        claim(fakeMedium, 'medium', r.targetId, d - 1, res)
      }
    }
  }

  const finish = (w: 'village' | 'wolf' | 'draw'): SimResult => {
    g.phase = 'finished'
    g.finished = w !== 'draw'
    g.winner = w === 'draw' ? null : w
    return { winner: w, days: g.day, pattern, game: g }
  }

  const winner = (): 'village' | 'wolf' | null => {
    const w = g.players.filter((p) => p.alive && p.actualRole === 'wolf').length
    const o = g.players.filter((p) => p.alive && p.actualRole !== 'wolf').length
    if (w === 0) return 'village'
    if (w >= o) return 'wolf'
    return null
  }

  // 投票ラウンドを1つ行い、得票最多者（同数なら複数）を返す。
  const runRound = (kind: VoteRoundKind, candidateIds: PlayerId[]): { round: VoteRound; leaders: PlayerId[] } => {
    const round: VoteRound = { id: `r${g.day}-${kind}`, day: g.day, kind, aiOrder: null, votes: [], candidateIds, executedId: null, resolved: false, nextVoteOrder: 1 }
    g.voteRounds.push(round)
    const voters = shuffle(
      ids.filter((id) => alive(id) && (kind === 'normal' || !candidateIds.includes(id))),
      rng,
    )
    // 決選の候補になった狩人は、弁明でCOする。
    if (kind !== 'normal' && candidateIds.includes(bodyguard)) bodyguardCo(g.voteEventCounter)
    for (const voterId of voters) {
      let targetId: PlayerId
      try {
        const d = decideVote(buildAiView(g, voterId, { currentRoundId: round.id }), { id: round.id, kind, candidateIds }, rng, params)
        targetId = d.targetId
        log?.(`  投票 ${voterId}(${roleOf(voterId)}) → ${targetId}(${roleOf(targetId)})：${d.reasons.slice(1).join(' / ')}`)
      } catch {
        continue
      }
      const v: Vote = { voterId, targetId, recordedAt: '', order: round.votes.length + 1, globalOrder: ++g.voteEventCounter, afterEventOrder: g.eventCounter }
      round.votes.push(v)
      // 通常投票の途中で、狩人に最多票が集まり処刑されそうなら（投票の半数以上が済んだ時点）COする。
      if (kind === 'normal' && !bodyguardCoed && alive(bodyguard) && round.votes.length * 2 >= voters.length) {
        const c = new Map<PlayerId, number>()
        for (const x of round.votes) c.set(x.targetId, (c.get(x.targetId) ?? 0) + 1)
        const top = Math.max(...c.values())
        if ((c.get(bodyguard) ?? 0) === top) bodyguardCo(g.voteEventCounter)
      }
    }
    round.resolved = true
    const counts = new Map<PlayerId, number>()
    for (const v of round.votes) counts.set(v.targetId, (counts.get(v.targetId) ?? 0) + 1)
    const max = Math.max(0, ...counts.values())
    const leaders = max > 0 ? [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id) : []
    if (leaders.length === 1) round.executedId = leaders[0]
    return { round, leaders }
  }

  for (; g.day <= MAX_DAYS; g.day++) {
    // 昼：結果公表 → 投票（同数なら決選2回まで）。
    g.phase = 'day'
    log?.(`■${g.day}日目 生存: ${ids.filter(alive).map((id) => `${id}(${roleOf(id)})`).join(' ')}`)
    announce()
    g.phase = 'vote'
    let executed: PlayerId | null = null
    let res = runRound('normal', ids.filter(alive))
    if (res.leaders.length === 1) executed = res.leaders[0]
    else if (res.leaders.length > 1) {
      res = runRound('runoff1', res.leaders)
      if (res.leaders.length === 1) executed = res.leaders[0]
      else if (res.leaders.length > 1) {
        res = runRound('runoff2', res.leaders)
        if (res.leaders.length === 1) executed = res.leaders[0]
      }
    }
    if (executed) {
      g.players = g.players.map((p) => (p.id === executed ? { ...p, alive: false, death: { day: g.day, phase: 'execution', trueCause: 'execution', publicCause: '処刑' } } : p))
    }
    log?.(`  処刑: ${executed ? `${executed}(${roleOf(executed)})` : 'なし'}`)
    const w1 = winner()
    if (w1) return finish(w1)

    // 夜：予言 → 霊媒 → 護衛 → 襲撃。
    g.phase = 'night'
    const night: NightRecord = { day: g.day, seer: null, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null }
    if (alive(seer)) {
      const t = decideSeerTarget(buildAiView(g, seer), rng).targetId
      const r = roleOf(t) === 'wolf' ? 'wolf' : 'not-wolf'
      night.seer = { day: g.day, targetId: t, result: r }
      seerResultOf.set(g.day, { targetId: t, result: r })
    }
    if (executed && alive(medium)) {
      const r = roleOf(executed) === 'wolf' ? 'wolf' : 'not-wolf'
      night.medium = { day: g.day, targetId: executed, result: r }
      mediumResultOf.set(g.day, { targetId: executed, result: r })
    } else if (executed) {
      // 偽霊媒師の公表用に処刑者だけ記録する（真の霊媒師が死亡していても偽物は公表できる）。
      mediumResultOf.set(g.day, { targetId: executed, result: roleOf(executed) === 'wolf' ? 'wolf' : 'not-wolf' })
    }
    let guardTarget: PlayerId | null = null
    if (alive(bodyguard)) {
      try {
        const gd = decideGuardTarget(buildAiView(g, bodyguard), prevGuardMode, rng)
        guardTarget = gd.targetId
        prevGuardMode = gd.mode
      } catch {
        prevGuardMode = null
      }
    }
    const leadWolf = wolves.find(alive)!
    const attack = decideWolfAttack(buildAiView(g, leadWolf), rng).targetId
    const success = guardTarget === attack
    if (guardTarget) {
      night.bodyguard = { day: g.day, targetId: guardTarget, success }
      guardHistory.push({ night: g.day, targetId: guardTarget, success })
    }
    night.wolf = { day: g.day, targetId: attack, success: !success }
    g.nightRecords.push(night)
    log?.(`  夜: 予言 ${night.seer?.targetId ?? '-'} / 護衛 ${guardTarget ?? '-'} / 襲撃 ${attack}(${roleOf(attack)}) ${success ? '護衛成功' : ''}`)
    if (!success) {
      g.players = g.players.map((p) => (p.id === attack ? { ...p, alive: false, death: { day: g.day, phase: 'night', trueCause: 'wolf-attack', publicCause: '襲撃' } } : p))
    }
    const w2 = winner()
    if (w2) return finish(w2)
  }
  g.day = MAX_DAYS
  return finish('draw')
}
