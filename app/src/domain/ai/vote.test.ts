import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../factory'
import type { CoRecord, GameState, PlayerId, ResultClaim, RoleKey, Vote, VoteRound } from '../types'
import { buildAiView } from './view'
import { centralVoteOrder, decideVote } from './vote'
import { adoptedMediumResults, villageScores } from './analysis'

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
  it('11-6: 予言者・霊媒師・狩人AIも人狼CO者に投票する', () => {
    for (const ai of ['p5', 'p6', 'p7']) {
      const g = setup(ai, 3)
      co(g, 'p2', 'wolf', 3)
      const r = round(g, 'normal', [])
      expect(decide(g, ai, r).targetId).toBe('p2')
    }
  })
  it('11-6: 予言者AIは人狼CO者に先行票があれば自分の黒判定より合わせ、なければ黒判定へ', () => {
    const g = setup('p5', 3)
    g.nightRecords.push({ day: 1, seer: { day: 1, targetId: 'p1', result: 'wolf' }, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null })
    co(g, 'p2', 'wolf', 3)
    expect(decide(g, 'p5', round(g, 'normal', [['p9', 'p2']])).targetId).toBe('p2')
    expect(decide(g, 'p5', round(g, 'normal', [['p9', 'p10']])).targetId).toBe('p1')
  })
  it('11-6: 人狼CO者が複数なら票の多い人に合わせる', () => {
    const g = setup('p8', 3)
    co(g, 'p3', 'wolf', 3)
    co(g, 'p1', 'wolf', 3)
    const r = round(g, 'normal', [['p9', 'p1'], ['p10', 'p1'], ['p11', 'p3']])
    expect(decide(g, 'p8', r).targetId).toBe('p1')
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
    const res = decide(g, 'p8', r, seq(0.5))
    expect(res.reasons.join()).toContain('解除済みの破綻者')
    expect(res.reasons.join()).not.toContain('破綻者へ投票')
    // ローラーがなければ先行票に重ねず、重み付きランダム（選ばれやすさ2倍）で選ぶ。
    expect(res.reasons.join()).not.toContain('重ねる')
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
  it('撤回時点の記録あり：撤回の後に起きた出来事とは組み合わせない', () => {
    // p9が2日目に p10 へ黒 → 2日目のうちに撤回 → 2日目の夜に p10 が襲撃死（3日目に公開）。
    // 黒と襲撃死は同時に存在していないので、破綻（条件A）の履歴にはならない。
    const g = setup('p8', 3)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 2)
    const c = g.resultClaims[g.resultClaims.length - 1]
    c.announcedDay = 2
    c.retracted = true
    c.retractedAt = { order: ++order, day: 2 }
    kill(g, 'p10', 'wolf-attack', 2)
    co(g, 'p11', 'bodyguard', 3)
    const r = round(g, 'normal', [['p12', 'p9']])
    expect(decide(g, 'p8', r).reasons.join()).not.toContain('解除済み')
  })
  it('撤回時点の記録あり：襲撃死の公開後に撤回したら解除済みとして扱う', () => {
    const g = setup('p8', 4)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 2)
    const c = g.resultClaims[g.resultClaims.length - 1]
    c.announcedDay = 2
    kill(g, 'p10', 'wolf-attack', 2)
    co(g, 'p11', 'bodyguard', 3) // 3日目の時点：黒と襲撃死が同時に存在（破綻）
    c.retracted = true
    c.retractedAt = { order: ++order, day: 3 }
    const r = round(g, 'normal', [['p12', 'p9']])
    expect(decide(g, 'p8', r).reasons.join()).toContain('解除済み（A:')
  })
  it('他人の撤回で条件から外れた場合は解除済みにしない', () => {
    // 確定霊媒師p6がp10に白、予言者CO者p9がp10に黒（条件C）→ 霊媒師が白を撤回。
    const g = setup('p8', 3)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    co(g, 'p6', 'medium', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 1)
    g.resultClaims[g.resultClaims.length - 1].targetDay = 2
    kill(g, 'p10', 'execution', 2)
    claim(g, 'medium', 'p6', 'p10', 'not-wolf', 2)
    co(g, 'p11', 'bodyguard', 3)
    const m = g.resultClaims[g.resultClaims.length - 1]
    m.retracted = true
    m.retractedAt = { order: ++order, day: 3 }
    const r = round(g, 'normal', [['p12', 'p9']])
    expect(decide(g, 'p8', r).reasons.join()).not.toContain('解除済み')
  })
  it('狂人AIは解除済みの人を人狼扱いしない', () => {
    const g = setup('p4', 2)
    released(g)
    const r = round(g, 'normal', [])
    expect(decide(g, 'p4', r).reasons.join()).not.toContain('人狼扱いで投票対象外')
  })
})

describe('C項目: 投票・ローラー', () => {
  it('C-2: 霊媒結果の割れが複数あれば平等に扱い、先行票のある黒側の霊媒師に重ねる', () => {
    const g = setup('p8', 3)
    co(g, 'p6', 'medium', 1)
    co(g, 'p9', 'medium', 1)
    kill(g, 'p10', 'execution', 1)
    kill(g, 'p11', 'execution', 2)
    claim(g, 'medium', 'p6', 'p10', 'wolf', 1)
    claim(g, 'medium', 'p9', 'p10', 'not-wolf', 1)
    claim(g, 'medium', 'p9', 'p11', 'wolf', 2)
    claim(g, 'medium', 'p6', 'p11', 'not-wolf', 2)
    // 2つ目の割れで黒を出したp9に先行票がある → 最初の割れだけを見ていた旧実装ではp9に重ねない。
    const r = round(g, 'normal', [['p12', 'p9']])
    expect(decide(g, 'p8', r).targetId).toBe('p9')
  })
  function rollerGame(aiId: PlayerId) {
    const g = setup(aiId, 2)
    co(g, 'p6', 'medium', 1)
    co(g, 'p2', 'medium', 1)
    const d1 = round(g, 'normal', [['p8', 'p6'], ['p9', 'p6'], ['p10', 'p2']])
    d1.day = 1
    d1.resolved = true
    return g
  }
  it('C-4: 人狼AIは仲間を除いてローラーに参加する', () => {
    const g = rollerGame('p1')
    const r = round(g, 'normal', [['p9', 'p2']])
    // 仲間のp2は除き、残るローラー対象p6へ。
    expect(decide(g, 'p1', r).targetId).toBe('p6')
  })
  it('C-4: 狂人AIもローラー対象のうち票の多い人へ重ねる', () => {
    const g = rollerGame('p4')
    const r = round(g, 'normal', [['p9', 'p2'], ['p10', 'p2']])
    expect(decide(g, 'p4', r).targetId).toBe('p2')
  })
  it('C-5: 初日の決選の公開済み票からもローラーを認識する', () => {
    const g = setup('p8', 2)
    co(g, 'p6', 'medium', 1)
    co(g, 'p9', 'medium', 1)
    const n1 = round(g, 'normal', [['p10', 'p11'], ['p11', 'p6'], ['p12', 'p13']])
    n1.day = 1; n1.resolved = true
    const r1 = round(g, 'runoff1', [['p10', 'p6'], ['p12', 'p6'], ['p13', 'p11']], ['p6', 'p11'])
    r1.day = 1; r1.resolved = true
    const r = round(g, 'normal', [])
    expect(decide(g, 'p8', r).reasons.join()).toContain('初日の決選投票')
  })
  it('C-6: ローラー開始後に同じ役職をCOした人も対象に加える', () => {
    const g = setup('p8', 2)
    co(g, 'p6', 'medium', 1)
    co(g, 'p9', 'medium', 1)
    const d1 = round(g, 'normal', [['p10', 'p6'], ['p11', 'p9']])
    d1.day = 1; d1.resolved = true
    kill(g, 'p6', 'execution', 1)
    kill(g, 'p9', 'wolf-attack', 1)
    co(g, 'p12', 'medium', 2)
    const r = round(g, 'normal', [])
    expect(decide(g, 'p8', r).targetId).toBe('p12')
  })
  it('C-7: 決選では直前ラウンドの得票を先行票の代わりに使う', () => {
    const g = setup('p8', 3)
    co(g, 'p3', 'wolf', 3)
    co(g, 'p1', 'wolf', 3)
    const n = round(g, 'normal', [['p9', 'p1'], ['p10', 'p1'], ['p11', 'p3'], ['p12', 'p3']])
    n.resolved = true
    // 直前ラウンドで p1 と p3 が同数 → 同数なら最初にCOした p3。p1 に多ければ p1。
    n.votes.push({ voterId: 'p13', targetId: 'p1', recordedAt: '', order: 5, globalOrder: 5 })
    const r = round(g, 'runoff1', [], ['p1', 'p3'])
    expect(decide(g, 'p8', r).targetId).toBe('p1')
  })
  it('C-8: 人狼AIは仲間以外の破綻者に先行票があれば重ねる', () => {
    const g = setup('p1', 2)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    claim(g, 'seer', 'p9', 'p10', 'wolf', 1) // 初日の黒（破綻条件E）
    const r = round(g, 'normal', [['p11', 'p9']])
    expect(decide(g, 'p1', r).targetId).toBe('p9')
  })
  it('C-10: 霊媒CO者全員が黒なら人狼の処刑を確認済みとして余裕数を計算する', () => {
    const g = setup('p8', 2)
    co(g, 'p6', 'medium', 1)
    co(g, 'p9', 'medium', 1)
    kill(g, 'p1', 'execution', 1)
    claim(g, 'medium', 'p6', 'p1', 'wolf', 1)
    claim(g, 'medium', 'p9', 'p1', 'wolf', 1)
    const r = round(g, 'normal', [])
    expect(decide(g, 'p8', r, seq(0.5)).reasons.join()).toContain('残存人外最大3人')
  })
  it('C-13: 狂人COした人（霊媒結果は人間）への投票は0点', () => {
    const g = setup('p8', 2)
    co(g, 'p6', 'medium', 1)
    co(g, 'p4', 'madman', 1)
    const d1 = round(g, 'normal', [['p9', 'p4'], ['p10', 'p11']])
    d1.day = 1; d1.resolved = true; d1.executedId = 'p4'
    kill(g, 'p4', 'execution', 1)
    claim(g, 'medium', 'p6', 'p4', 'not-wolf', 1)
    const r = round(g, 'normal', [])
    const reasons = decide(g, 'p8', r, seq(0.5)).reasons.join()
    expect(reasons).not.toContain('プレイヤー9 -10')
    // 対照：狂人COを撤回させると通常どおり－10になる。
    g.coRecords.find((c) => c.playerId === 'p4')!.status = 'retracted'
    expect(decide(g, 'p8', round(g, 'normal', []), seq(0.5)).reasons.join()).toContain('プレイヤー9 -10')
  })
  it('C-12: 投票時点で破綻していた人への票は、後で人狼と分かっても0点（破綻前の票は通常どおり）', () => {
    const g = setup('p8', 3)
    co(g, 'p5', 'seer', 1)
    co(g, 'p9', 'seer', 1)
    co(g, 'p6', 'medium', 1)
    const before = order
    claim(g, 'seer', 'p9', 'p10', 'wolf', 1) // 初日の黒（破綻条件E）
    const after = order
    const d2 = round(g, 'normal', [['p11', 'p9'], ['p12', 'p9']])
    d2.day = 2; d2.resolved = true; d2.executedId = 'p9'
    d2.votes[0].afterEventOrder = after // 破綻の公開後の票
    d2.votes[1].afterEventOrder = before // 破綻の公開前の票（比較用）
    kill(g, 'p9', 'execution', 2)
    claim(g, 'medium', 'p6', 'p9', 'wolf', 2)
    const view = buildAiView(g, 'p8')
    const scores = villageScores(view, adoptedMediumResults(view))
    expect(scores.get('p11') ?? 0).toBe(0)
    expect(scores.get('p12')).toBe(20)
  })
})
