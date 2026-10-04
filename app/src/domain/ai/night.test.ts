import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../factory'
import type { GameState, NightRecord, PlayerId, RoleKey } from '../types'
import { buildAiView } from './view'
import { decideGuardTarget, decideSeerTarget, decideWolfAttack } from './night'

const ROLES: RoleKey[] = ['wolf', 'wolf', 'wolf', 'madman', 'seer', 'medium', 'bodyguard', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']

function setup(aiId: PlayerId, day = 1): GameState {
  const g = createInitialGameState()
  g.players = g.players.map((p, i) => ({ ...p, actualRole: ROLES[i], isAi: p.id === aiId }))
  g.day = day
  g.phase = 'night'
  return g
}
let n = 0
function co(g: GameState, playerId: PlayerId, role: RoleKey) {
  g.coRecords.push({ id: `co${++n}`, eventOrder: n, day: 1, claimedRole: role, playerId, recordedAt: '', status: 'active', supersedes: null, note: '', afterVoteCount: null })
}
function night(day: number, patch: Partial<NightRecord>): NightRecord {
  return { day, seer: null, seerSkipped: false, medium: null, mediumSkipped: false, bodyguard: null, guardSkipped: false, wolf: null, ...patch }
}
function kill(g: GameState, id: PlayerId, day: number) {
  g.players = g.players.map((p) => (p.id === id ? { ...p, alive: false, death: { day, phase: 'night', trueCause: 'wolf-attack', publicCause: '襲撃' } } : p))
}
const rngs = Array.from({ length: 20 }, (_, i) => () => i / 20)

describe('予言対象（方針C-3）', () => {
  it('役職CO者・予言済み・自分を除く', () => {
    const g = setup('p5', 2)
    g.day1WhiteNotice = 'p8'
    co(g, 'p6', 'medium'); co(g, 'p4', 'seer')
    for (const r of rngs) expect(['p5', 'p6', 'p4', 'p8']).not.toContain(decideSeerTarget(buildAiView(g, 'p5'), r).targetId)
  })
  it('B-7: 人狼CO者・狂人CO者も除外し、村人CO者は除外しない', () => {
    const g = setup('p5', 2)
    co(g, 'p1', 'wolf'); co(g, 'p4', 'madman'); co(g, 'p9', 'villager')
    const targets = rngs.map((r) => decideSeerTarget(buildAiView(g, 'p5'), r).targetId)
    for (const t of targets) expect(['p1', 'p4']).not.toContain(t)
    expect(targets).toContain('p9')
  })
  it('通常候補がゼロなら未予言の役職CO者', () => {
    const g = setup('p5', 2)
    co(g, 'p6', 'medium')
    g.players = g.players.map((p) => (['p5', 'p6', 'p8'].includes(p.id) ? p : { ...p, alive: false }))
    g.day1WhiteNotice = 'p8'
    expect(decideSeerTarget(buildAiView(g, 'p5')).targetId).toBe('p6')
  })
})

describe('護衛（5-4-1）', () => {
  it('自分と前夜の護衛先は選ばない', () => {
    const g = setup('p7', 3)
    g.nightRecords.push(night(2, { bodyguard: { day: 2, targetId: 'p9', success: false } }))
    for (const r of rngs) expect(['p7', 'p9']).not.toContain(decideGuardTarget(buildAiView(g, 'p7'), null, r).targetId)
  })
  it('C-15: 護衛成功の翌夜は堅実と捨て護衛を各50％', () => {
    const g = setup('p7', 3)
    co(g, 'p5', 'seer')
    g.nightRecords.push(night(2, { bodyguard: { day: 2, targetId: 'p9', success: true } }))
    expect(decideGuardTarget(buildAiView(g, 'p7'), 'seer', () => 0.1).mode).toBe('solid')
    expect(decideGuardTarget(buildAiView(g, 'p7'), 'seer', () => 0.9).mode).toBe('throwaway')
    // 前夜が捨て護衛なら、成功していても堅実（連続の捨て護衛はしない）。
    expect(decideGuardTarget(buildAiView(g, 'p7'), 'throwaway', () => 0.9).mode).toBe('solid')
  })
  it('前夜が捨て護衛なら確定役職者を守る', () => {
    const g = setup('p7', 3)
    co(g, 'p5', 'seer')
    const res = decideGuardTarget(buildAiView(g, 'p7'), 'throwaway', () => 0.9)
    expect(res.mode).toBe('solid')
    expect(res.targetId).toBe('p5')
  })
  it('今夜の襲撃先は護衛AIには生存として見える', () => {
    const g = setup('p7', 2)
    kill(g, 'p9', 2)
    expect(buildAiView(g, 'p7').players.find((p) => p.id === 'p9')!.alive).toBe(true)
  })
})

describe('襲撃（5-4-2）', () => {
  it('仲間は襲撃せず、偶数なら狩人CO者を最優先', () => {
    const g = setup('p1', 2)
    g.players = g.players.map((p) => (p.id === 'p2' || p.id === 'p3' ? { ...p, alive: false } : p)) // 生存11人
    g.players = g.players.map((p) => (p.id === 'p13' ? { ...p, alive: false } : p)) // 生存10人（偶数）
    co(g, 'p7', 'bodyguard'); co(g, 'p5', 'seer')
    expect(decideWolfAttack(buildAiView(g, 'p1')).targetId).toBe('p7')
  })
  it('確定役職者がいなければ得票の少ない人', () => {
    const g = setup('p1', 1)
    for (const r of rngs) expect(['p1', 'p2', 'p3']).not.toContain(decideWolfAttack(buildAiView(g, 'p1'), r).targetId)
  })
})
