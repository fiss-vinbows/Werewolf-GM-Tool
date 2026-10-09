import { describe, expect, it } from 'vitest'
import { createInitialGameState } from './factory'
import type { GameState, PlayerId, RoleKey } from './types'
import { exportResultCsv } from './exportCsv'

// ユーザー提供の様式（14人）の例を再現する。名前は「プレイヤーN」。
function sampleGame(): GameState {
  const g = createInitialGameState()
  const roles: RoleKey[] = ['villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'bodyguard', 'medium', 'seer', 'madman', 'wolf', 'wolf', 'wolf']
  g.players = roles.map((r, i) => ({ ...g.players[0], id: `p${i + 1}`, displayName: `プレイヤー${i + 1}`, registrationOrder: i + 1, actualRole: r, isAi: i === 6, alive: true, death: null }))
  let order = 0
  const co = (id: PlayerId, role: RoleKey) =>
    g.coRecords.push({ id: `co${++order}`, eventOrder: order, day: 1, claimedRole: role, playerId: id, recordedAt: '', status: 'active', supersedes: null, note: '', afterVoteCount: null })
  const claim = (id: PlayerId, target: PlayerId, result: 'wolf' | 'not-wolf') =>
    g.resultClaims.push({ id: `c${++order}`, eventOrder: order, coId: '', kind: 'seer', speakerId: id, targetId: target, targetDay: 1, announcedDay: 1, result, recordedAt: '', retracted: false })
  g.day1WhiteNotice = 'p2' // 初日白
  co('p10', 'seer')
  co('p14', 'seer') // 騙り予言者1
  co('p11', 'seer') // 騙り予言者2
  claim('p14', 'p3', 'not-wolf')
  claim('p11', 'p12', 'not-wolf')
  claim('p14', 'p7', 'not-wolf')
  const kill = (id: PlayerId, day: number, cause: 'execution' | 'wolf-attack') => {
    g.players = g.players.map((p) => (p.id === id ? { ...p, alive: false, death: { day, phase: cause === 'execution' ? 'execution' : 'night', trueCause: cause, publicCause: cause === 'execution' ? '処刑' : '襲撃' } } : p))
  }
  const round = (day: number, executedId: PlayerId) =>
    g.voteRounds.push({ id: `r${day}`, day, kind: 'normal', aiOrder: null, votes: [], candidateIds: [], executedId, resolved: true, nextVoteOrder: 1 })
  round(1, 'p11')
  kill('p11', 1, 'execution')
  g.nightRecords.push({ day: 1, seer: { day: 1, targetId: 'p12', result: 'wolf' }, seerSkipped: false, medium: { day: 1, targetId: 'p11', result: 'not-wolf' }, mediumSkipped: false, bodyguard: { day: 1, targetId: 'p9', success: false }, guardSkipped: false, wolf: { day: 1, targetId: 'p5', success: true } })
  kill('p5', 1, 'wolf-attack')
  round(2, 'p14')
  kill('p14', 2, 'execution')
  g.nightRecords.push({ day: 2, seer: null, seerSkipped: false, medium: { day: 2, targetId: 'p14', result: 'wolf' }, mediumSkipped: false, bodyguard: { day: 2, targetId: 'p10', success: true }, guardSkipped: false, wolf: { day: 2, targetId: 'p10', success: false } })
  g.day = 2
  return g
}

describe('スプレッドシート用CSV', () => {
  it('ユーザー提供の様式と同じ並びで書き出す', () => {
    const lines = exportResultCsv(sampleGame()).trim().split('\r\n')
    expect(lines[0]).toBe('プレイヤー,役職,生存情報,補足情報,,初日,2日目,3日目,4日目,5日目,6日目,7日目,8日目')
    expect(lines[1]).toBe('プレイヤー1,村人,生存,,処刑,プレイヤー11,プレイヤー14,,,,,,')
    expect(lines[2]).toBe('プレイヤー2,村人,生存,,襲撃,プレイヤー5,プレイヤー10（失敗）,,,,,,')
    // 初日は初日白の通知先、2日目は1日目の夜の予言結果。
    expect(lines[3]).toBe('プレイヤー3,村人,生存,,予言者,プレイヤー2→白,プレイヤー12→黒,,,,,,')
    expect(lines[4]).toBe('プレイヤー4,村人,生存,,騙り予言者1,プレイヤー3→白,プレイヤー7→白,,,,,,')
    expect(lines[5]).toBe('プレイヤー5,村人,1日目襲撃,,騙り予言者2,プレイヤー12→白,－,,,,,,')
    expect(lines[6]).toBe('プレイヤー6,村人,生存,,霊媒師,プレイヤー11→白,プレイヤー14→黒,,,,,,')
    expect(lines[7]).toBe('プレイヤー7,村人,生存,AI,狩人,プレイヤー9,プレイヤー10（護衛）,,,,,,')
    expect(lines[11]).toBe('プレイヤー11,狂人,1日目処刑,騙り予言者2,,,,,,,,,')
    expect(lines[14]).toBe('プレイヤー14,人狼,2日目処刑,騙り予言者1,,,,,,,,,')
    // 表の下：投票履歴・CO履歴・結果公表の履歴・対戦情報。
    expect(lines[15]).toBe('')
    expect(lines[16]).toBe('投票履歴,,,,,初日,2日目,3日目,4日目,5日目,6日目,7日目,8日目')
    const co = lines.indexOf('CO履歴,日,役職,状態,補足')
    expect(lines[co + 1]).toBe('プレイヤー10,1日目,予言者,CO中,')
    expect(lines[co + 2]).toBe('プレイヤー14,1日目,予言者,CO中,')
    const claims = lines.indexOf('結果公表の履歴,公表日,種類,対象,結果')
    expect(lines[claims + 1]).toBe('プレイヤー14,1日目,予言者,プレイヤー3,白')
    const info = lines.findIndex((l) => l.startsWith('対戦日,'))
    expect(info).toBeGreaterThan(claims)
    expect(lines[info + 2]).toBe('勝利陣営,（進行中）')
    expect(lines[info + 3]).toBe('終了日,2日目')
    expect(lines[info + 4]).toBe('人数,14人')
    expect(lines[info + 5]).toBe('ルールメモ,')
    expect(lines[info + 6]).toBe('自由メモ,')
  })
  it('ルールメモと自由メモを書き出す（改行やカンマはセル内に収める）', () => {
    const g = sampleGame()
    g.meta.ruleNote = '初日占いあり、連続護衛なし'
    g.meta.memo = '1行目\n2行目,カンマ'
    const csv = exportResultCsv(g)
    expect(csv).toContain('ルールメモ,初日占いあり、連続護衛なし')
    expect(csv).toContain('自由メモ,"1行目\n2行目,カンマ"')
  })
  it('AIの投票先の行と、騙り以外のCOを補足に書く', () => {
    const g = sampleGame()
    g.voteRounds[0].votes = [{ voterId: 'p7', targetId: 'p11', recordedAt: '', order: 1, globalOrder: 1 }]
    g.coRecords.push({ id: 'cox', eventOrder: 99, day: 2, claimedRole: 'villager', playerId: 'p14', recordedAt: '', status: 'active', supersedes: null, note: '遺言', afterVoteCount: null })
    const lines = exportResultCsv(g).trim().split('\r\n')
    expect(lines.find((l) => l.includes('AI投票'))).toBe('プレイヤー8,狩人,生存,,AI投票,プレイヤー11,,,,,,,')
    // 投票履歴のAIの行
    expect(lines.find((l) => l.startsWith('プレイヤー7,,,,,'))).toBe('プレイヤー7,,,,,プレイヤー11,,,,,,,')
    expect(lines[14]).toBe('プレイヤー14,人狼,2日目処刑,騙り予言者1・村人CO（遺言）,,,,,,,,,')
  })
})
