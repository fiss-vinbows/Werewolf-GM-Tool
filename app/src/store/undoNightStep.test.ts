import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../domain/factory'
import type { RoleKey } from '../domain/types'

const ROLES: RoleKey[] = ['wolf', 'wolf', 'wolf', 'seer', 'medium', 'bodyguard', 'madman', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']

// 1日目の夜。村人p8が処刑済み（霊媒が自動記録される場面）。
function setupNight() {
  const g = createInitialGameState()
  g.players = g.players.map((p, i) => ({ ...p, actualRole: ROLES[i] }))
  g.players[7] = { ...g.players[7], alive: false, death: { day: 1, phase: 'day', trueCause: 'execution', publicCause: '処刑' } }
  g.phase = 'night'
  g.day = 1
  useGameStore.setState({ game: g })
}

const st = () => useGameStore.getState()
const night = () => st().game.nightRecords.find((n) => n.day === 1)

describe('夜の行動の「入力ミスを1つ戻す」', () => {
  beforeEach(setupNight)

  it('護衛→予言→襲撃の順に、自動記録の霊媒を飛ばして戻せる', () => {
    st().setWolfAction({ day: 1, targetId: 'p9' })
    st().setSeerAction({ day: 1, targetId: 'p1' })
    st().setMediumAction({ day: 1, targetId: 'p8' }) // 画面では自動で記録される
    st().setBodyguardAction({ day: 1, targetId: 'p10' })
    expect(night()?.bodyguard).toBeTruthy()

    st().undoNightStep()
    expect(night()?.bodyguard).toBeFalsy()
    expect(night()?.medium).toBeTruthy()

    st().undoNightStep()
    expect(night()?.seer).toBeFalsy()
    expect(night()?.medium).toBeFalsy()
    expect(night()?.wolf).toBeTruthy()

    st().undoNightStep()
    expect(night()?.wolf).toBeFalsy()
    // 襲撃で死亡にした人も生き返る
    expect(st().game.players.find((p) => p.id === 'p9')?.alive).toBe(true)
    expect(st().game.phase).toBe('night')

    // それ以上は戻らない（昼へは戻さない）
    st().undoNightStep()
    expect(st().game.phase).toBe('night')
  })

  it('予言者が前日までに死亡していれば、狩人の次は襲撃まで戻す', () => {
    const g = st().game
    g.players[3] = { ...g.players[3], alive: false, death: { day: 1, phase: 'day', trueCause: 'execution', publicCause: '処刑' } }
    st().setWolfAction({ day: 1, targetId: 'p9' })
    st().skipSeerAction(1)
    st().setMediumAction({ day: 1, targetId: 'p8' })
    st().setBodyguardAction({ day: 1, targetId: 'p10' })
    st().undoNightStep()
    st().undoNightStep()
    expect(night()?.wolf).toBeFalsy()
  })
})

describe('新規ゲーム', () => {
  it('設定を引き継ぐ', () => {
    setupNight()
    st().updateMeta({ resultLabelStyle: 'black-white', ruleNote: 'メモ', day1WhiteNoticeMode: 'manual' })
    st().setRoleName('seer', '占い師')
    st().resetGame()
    const m = st().game.meta
    expect(m.resultLabelStyle).toBe('black-white')
    expect(m.ruleNote).toBe('メモ')
    expect(m.day1WhiteNoticeMode).toBe('manual')
    expect(m.roleNames.seer).toBe('占い師')
    expect(st().game.phase).toBe('setup')
  })
})
