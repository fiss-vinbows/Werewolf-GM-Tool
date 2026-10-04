import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../factory'
import type { CoRecord, GameState, PlayerId, ResultClaim, RoleKey, Vote, VoteRound } from '../types'
import { buildAiView } from './view'
import { centralVoteOrder, decideVote } from './vote'

// 13人：p1〜p3 人狼、p4 狂人、p5 予言者、p6 霊媒師、p7 狩人、p8〜p13 村人
const ROLES: RoleKey[] = ['wolf', 'wolf', 'wolf', 'madman', 'seer', 'medium', 'bodyguard', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']

function setup(aiId: PlayerId, day = 1): GameState {
  const g = createInitialGameState()
  g.players = g.players.map((p, i) => ({ ...p, actualRole: ROLES[i], isAi: p.id === aiId }))
  g.day = day
  g.phase = 'vote'
  return g
}

let order = 0
function co(g: GameState, playerId: PlayerId, role: RoleKey, day = 1) {
  const rec: CoRecord = { id: `co${++order}`, eventOrder: order, day, claimedRole: role, playerId, recordedAt: '', status: 'active', supersedes: null, note: '', afterVoteCount: null }
  g.coRecords.push(rec)
}
function claim(g: GameState, kind: 'seer' | 'medium', speakerId: PlayerId, targetId: PlayerId, result: 'wolf' | 'not-wolf', targetDay = 2) {
  const c: ResultClaim = { id: `c${++order}`, eventOrder: order, coId: '', kind, speakerId, targetId, targetDay, announcedDay: g.day, result, recordedAt: '', retracted: false }
  g.resultClaims.push(c)
}
function round(g: GameState, kind: VoteRound['kind'] = 'normal', votes: [PlayerId, PlayerId][] = [], candidateIds?: PlayerId[]): VoteRound {
  const r: VoteRound = {
    id: `r${++order}`,
    day: g.day,
    kind,
    aiOrder: 7,
    votes: votes.map(([voterId, targetId], i): Vote => ({ voterId, targetId, recordedAt: '', order: i + 1, globalOrder: i + 1 })),
    candidateIds: candidateIds ?? g.players.filter((p) => p.alive).map((p) => p.id),
    executedId: null,
    resolved: false,
    nextVoteOrder: votes.length + 1,
  }
  g.voteRounds.push(r)
  return r
}
function kill(g: GameState, id: PlayerId, cause: 'execution' | 'wolf-attack', day: number) {
  g.players = g.players.map((p) => (p.id === id ? { ...p, alive: false, death: { day, phase: cause === 'execution' ? 'execution' : 'night', trueCause: cause, publicCause: cause === 'execution' ? '処刑' : '襲撃' } } : p))
}
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}
function decide(g: GameState, aiId: PlayerId, r: VoteRound, rng = seq(0)) {
  return decideVote(buildAiView(g, aiId, { currentRoundId: r.id }), r, rng)
}

describe('情報フィルタ', () => {
  it('村人AIには真の配役・夜の行動・決選の当該票を渡さない', () => {
    const g = setup('p8', 2)
    g.nightRecords.push({ day: 1, seer: { day: 1, targetId: 'p1', result: 'wolf' }, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    const r = round(g, 'runoff1', [['p9', 'p1']], ['p1', 'p2'])
    const view = buildAiView(g, 'p8', { currentRoundId: r.id })
    expect(JSON.stringify(view)).not.toContain('actualRole')
    expect(view.ownSeerResults).toEqual([])
    expect(view.wolfMateIds).toEqual([])
    expect(view.voteRounds.find((x) => x.id === r.id)!.votes).toEqual([])
  })
  it('予言者AIは初日白と前夜までの自分の結果だけを知る', () => {
    const g = setup('p5', 2)
    g.day1WhiteNotice = 'p9'
    g.nightRecords.push({ day: 1, seer: { day: 1, targetId: 'p1', result: 'wolf' }, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    g.nightRecords.push({ day: 2, seer: { day: 2, targetId: 'p2', result: 'wolf' }, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    const view = buildAiView(g, 'p5')
    expect(view.ownSeerResults.map((r) => r.targetId)).toEqual(['p9', 'p1'])
  })
  it('狂人AIは人狼の正体を知らない', () => {
    expect(buildAiView(setup('p4'), 'p4').wolfMateIds).toEqual([])
    expect(buildAiView(setup('p1'), 'p1').wolfMateIds).toEqual(['p2', 'p3'])
  })
})

describe('投票方針', () => {
  it('方針A: 初日単独CO者には投票しない', () => {
    const g = setup('p8')
    co(g, 'p9', 'seer')
    const r = round(g)
    for (let i = 0; i < 12; i++) {
      const res = decide(g, 'p8', r, seq(i / 12))
      expect(res.targetId).not.toBe('p9')
      expect(res.targetId).not.toBe('p8')
    }
  })
  it('方針C: 予言者AIは自分の黒へ0票でも継続投票し、白には投票しない', () => {
    const g = setup('p5', 2)
    g.nightRecords.push({ day: 1, seer: { day: 1, targetId: 'p2', result: 'wolf' }, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    co(g, 'p2', 'seer', 2) // 黒を出した相手が後から予言者CO
    const r = round(g, 'normal', [['p8', 'p9'], ['p10', 'p9']])
    expect(decide(g, 'p5', r).targetId).toBe('p2')
  })
  it('方針B: 真予言者AIは騙り予言者に投票しない', () => {
    const g = setup('p5', 2)
    co(g, 'p4', 'seer')
    const r = round(g, 'normal', [['p8', 'p4'], ['p9', 'p4']])
    for (let i = 0; i < 12; i++) expect(decide(g, 'p5', r, seq(i / 12)).targetId).not.toBe('p4')
  })
  it('予言者2COの両黒は確定人狼として投票する', () => {
    const g = setup('p8', 2)
    co(g, 'p5', 'seer'); co(g, 'p4', 'seer')
    claim(g, 'seer', 'p5', 'p1', 'wolf'); claim(g, 'seer', 'p4', 'p1', 'wolf')
    expect(decide(g, 'p8', round(g)).targetId).toBe('p1')
  })
  it('破綻者（初日の黒）に既得票があれば重ねる', () => {
    const g = setup('p8', 2)
    co(g, 'p5', 'seer'); co(g, 'p4', 'seer')
    claim(g, 'seer', 'p4', 'p10', 'wolf', 1)
    const r = round(g, 'normal', [['p9', 'p4']])
    expect(decide(g, 'p8', r).targetId).toBe('p4')
  })
  it('方針C-2c: 初日に霊媒CO者へ先行票の過半数が集中したらローラーに参加', () => {
    const g = setup('p8')
    co(g, 'p6', 'medium'); co(g, 'p3', 'medium')
    const r = round(g, 'normal', [['p9', 'p6'], ['p10', 'p6'], ['p11', 'p3'], ['p12', 'p1']])
    expect(decide(g, 'p8', r).targetId).toBe('p6')
  })
  it('ちょうど半数ではローラーを認識しない', () => {
    const g = setup('p8')
    co(g, 'p6', 'medium'); co(g, 'p3', 'medium')
    const r = round(g, 'normal', [['p9', 'p6'], ['p10', 'p1']])
    const res = decide(g, 'p8', r)
    expect(res.reasons.join()).not.toContain('ローラー')
  })
  it('人狼AIは仲間に投票しないが、決選で候補が全員仲間なら投票する', () => {
    const g = setup('p1')
    const r = round(g)
    for (let i = 0; i < 12; i++) expect(['p2', 'p3', 'p1']).not.toContain(decide(g, 'p1', r, seq(i / 12)).targetId)
    const run = round(g, 'runoff1', [], ['p2', 'p3'])
    expect(['p2', 'p3']).toContain(decide(g, 'p1', run).targetId)
  })
  it('狂人AIは自分に黒を出した予言者CO者を人狼扱いして投票しない', () => {
    const g = setup('p4', 2)
    co(g, 'p1', 'seer')
    claim(g, 'seer', 'p1', 'p4', 'wolf')
    const r = round(g)
    for (let i = 0; i < 12; i++) expect(decide(g, 'p4', r, seq(i / 12)).targetId).not.toBe('p1')
  })
  it('村人AIは決選で確定白しかいなければ役職者でない方を選ぶ', () => {
    const g = setup('p8', 2)
    co(g, 'p5', 'seer')
    claim(g, 'seer', 'p5', 'p9', 'not-wolf')
    co(g, 'p4', 'seer', 2) // 2人目の予言者
    claim(g, 'seer', 'p4', 'p9', 'not-wolf')
    claim(g, 'seer', 'p4', 'p5', 'not-wolf')
    claim(g, 'seer', 'p5', 'p4', 'not-wolf')
    const run = round(g, 'runoff1', [], ['p9', 'p5'])
    // 両者とも全予言者から白。単独CO扱いでないため役職者保護の対象外 → ランダム
    expect(['p9', 'p5']).toContain(decide(g, 'p8', run).targetId)
  })
  it('霊媒結果で人狼と判定された処刑者に投票した人は選ばれにくい', () => {
    const g = setup('p6', 2)
    const r1 = round(g, 'normal', [['p8', 'p1'], ['p9', 'p1'], ['p10', 'p11']])
    r1.resolved = true; r1.executedId = 'p1'
    kill(g, 'p1', 'execution', 1)
    g.nightRecords.push({ day: 1, seer: null, seerSkipped: false, medium: { day: 1, targetId: 'p1', result: 'wolf' }, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    const r2 = round(g)
    const res = decide(g, 'p6', r2, seq(0.5))
    expect(res.reasons.some((x) => x.includes('評価点'))).toBe(true)
    expect(res.reasons.join()).toContain('プレイヤー8 20')
  })
})

describe('方針D: 中央順', () => {
  it('13人なら7番目、8人なら4か5番目', () => {
    expect(centralVoteOrder(13)).toBe(7)
    expect(centralVoteOrder(7)).toBe(4)
    expect(centralVoteOrder(8, () => 0.1)).toBe(4)
    expect(centralVoteOrder(8, () => 0.9)).toBe(5)
  })
})

describe('11章: パワープレイ', () => {
  it('11-2: 狂人AIは最初の人狼CO者の公開済みの票に追従する（後からのCO者には切り替えない）', () => {
    const g = setup('p4', 3)
    co(g, 'p2', 'wolf', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [['p1', 'p9'], ['p2', 'p8']])
    expect(decide(g, 'p4', r).targetId).toBe('p8')
  })
  it('11-2: 追従先が人狼CO者でも追従する', () => {
    const g = setup('p4', 3)
    co(g, 'p2', 'wolf', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [['p2', 'p1']])
    expect(decide(g, 'p4', r).targetId).toBe('p1')
  })
  it('11-2: 最初のCO者が死亡したら次のCO者に切り替える', () => {
    const g = setup('p4', 3)
    co(g, 'p2', 'wolf', 2)
    co(g, 'p1', 'wolf', 2)
    kill(g, 'p2', 'execution', 2)
    const r = round(g, 'normal', [['p1', 'p10']])
    expect(decide(g, 'p4', r).targetId).toBe('p10')
  })
  it('11-2: 追従対象の票が見えなければ、人狼CO者を除いてランダム', () => {
    const g = setup('p4', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [])
    for (const x of [0, 0.3, 0.6, 0.99]) expect(decide(g, 'p4', r, seq(x)).targetId).not.toBe('p1')
  })
  it('11-2: 追従先が自分なら自分と人狼CO者を除いてランダム', () => {
    const g = setup('p4', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [['p1', 'p4']])
    const t = decide(g, 'p4', r).targetId
    expect(['p1', 'p4']).not.toContain(t)
  })
  it('11-5: 決選では直前ラウンドの公開済み票が候補に残っていれば追従', () => {
    const g = setup('p4', 3)
    co(g, 'p1', 'wolf', 3)
    const r1 = round(g, 'normal', [['p1', 'p9'], ['p2', 'p8']])
    r1.resolved = true
    const r2 = round(g, 'runoff1', [], ['p8', 'p9'])
    expect(decide(g, 'p4', r2).targetId).toBe('p9')
  })
  it('11-4: 人狼AIは人狼COした仲間の票に追従する（仲間への票でも）', () => {
    const g = setup('p1', 3)
    co(g, 'p2', 'wolf', 3)
    const r = round(g, 'normal', [['p2', 'p3']])
    expect(decide(g, 'p1', r).targetId).toBe('p3')
  })
  it('11-4: 仲間でない人の人狼COには追従しない', () => {
    const g = setup('p1', 3)
    co(g, 'p9', 'wolf', 3)
    const r = round(g, 'normal', [['p9', 'p2']])
    for (const x of [0, 0.5, 0.99]) expect(['p2', 'p3']).not.toContain(decide(g, 'p1', r, seq(x)).targetId)
  })
  it('11-6: 村人AIは最初の人狼CO者に投票する', () => {
    const g = setup('p8', 3)
    co(g, 'p3', 'wolf', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [])
    expect(decide(g, 'p8', r).targetId).toBe('p3')
  })
  it('11-6: 狂人CO者に先行票があれば重ね、なければランダム', () => {
    const g = setup('p8', 3)
    co(g, 'p4', 'madman', 3)
    const r = round(g, 'normal', [['p9', 'p4']])
    expect(decide(g, 'p8', r).targetId).toBe('p4')
    const g2 = setup('p8', 3)
    co(g2, 'p4', 'madman', 3)
    const r2 = round(g2, 'normal', [['p9', 'p10']])
    expect(decide(g2, 'p8', r2).reasons.join()).toContain('先行票がない')
  })
})

describe('7-4: 破綻の解除', () => {
  // p9が予言者COし、初日の結果として黒（破綻条件E）→ 撤回して解除。
  function released(g: GameState) {
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 1)
    g.resultClaims[g.resultClaims.length - 1].retracted = true
  }
  it('撤回で矛盾が解消したら、現在の破綻者からは外れ、解除済みとして扱う', () => {
    const g = setup('p8', 2)
    released(g)
    const r = round(g, 'normal', [['p11', 'p9']])
    const res = decide(g, 'p8', r)
    expect(res.reasons.join()).toContain('解除済みの破綻者')
    expect(res.reasons.join()).not.toContain('破綻者へ投票')
    expect(res.targetId).toBe('p9')
  })
  it('撤回されていなければ現在の破綻者のまま', () => {
    const g = setup('p8', 2)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 1)
    const r = round(g, 'normal', [['p11', 'p9']])
    expect(decide(g, 'p8', r).reasons.join()).toContain('破綻者へ投票')
  })
  it('解除済みの破綻者が0票でローラーもなければ、通常の判断へ進む', () => {
    const g = setup('p8', 2)
    released(g)
    const r = round(g, 'normal', [['p11', 'p12']])
    expect(decide(g, 'p8', r, seq(0.5)).reasons.join()).toContain('解除済みの破綻者:')
  })
  it('狂人AIは解除済みの人を人狼扱いしない', () => {
    const g = setup('p4', 2)
    released(g)
    const r = round(g, 'normal', [])
    expect(decide(g, 'p4', r).reasons.join()).not.toContain('人狼扱いで投票対象外')
  })
})
