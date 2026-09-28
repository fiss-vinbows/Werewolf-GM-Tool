import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { AiNightActionKind, PlayerId } from '../domain/types'
import { formatWolfResult } from '../domain/resultLabel'
import { RoleRoster } from './RoleRoster'

export function NightScreen({ onNextDay }: { onNextDay?: () => void }) {
  const game = useGameStore((s) => s.game)
  const setSeerAction = useGameStore((s) => s.setSeerAction)
  const skipSeerAction = useGameStore((s) => s.skipSeerAction)
  const setMediumAction = useGameStore((s) => s.setMediumAction)
  const skipMediumAction = useGameStore((s) => s.skipMediumAction)
  const setBodyguardAction = useGameStore((s) => s.setBodyguardAction)
  const skipGuardAction = useGameStore((s) => s.skipGuardAction)
  const setWolfAction = useGameStore((s) => s.setWolfAction)
  const advanceToNextDay = useGameStore((s) => s.advanceToNextDay)
  const undo = useGameStore((s) => s.undo)
  const decideAiNightAction = useGameStore((s) => s.decideAiNightAction)

  const alivePlayers = game.players.filter((p) => p.alive)
  const night = game.nightRecords.find((n) => n.day === game.day)

  // 人狼は仲間の人狼を襲撃できない（3章）。
  const wolfCandidates = alivePlayers.filter((p) => p.actualRole !== 'wolf')

  const trueSeer = game.players.find((p) => p.actualRole === 'seer')
  const trueGuard = game.players.find((p) => p.actualRole === 'bodyguard')


  // 「すでに死亡している」＝処刑された、または前日以前に襲撃された場合のみを指す。
  // 今夜人狼に襲撃された対象は、まだ今夜の行動自体は行える（結果が判明するのは翌朝）ため、
  // 自動スキップの対象にしてはいけない。
  function isAlreadyDeadBeforeTonight(p: { id: string; alive: boolean; death: { day: number; trueCause: string } | null } | undefined): boolean {
    if (!p) return false
    if (p.alive) return false
    if (p.death?.trueCause === 'wolf-attack' && p.death.day === game.day && night?.wolf?.targetId === p.id) {
      // 今夜の襲撃によって仮に死亡表示になっているだけ：まだ生きているものとして扱う。
      return false
    }
    return true
  }

  // 護衛対象には、人狼に襲撃されて仮に死亡表示になっている人も含める（護衛成功で蘇生できるようにする）。
  const wolfTargetPlayer = night?.wolf ? game.players.find((p) => p.id === night.wolf!.targetId) : undefined
  const guardBaseCandidates =
    wolfTargetPlayer && !wolfTargetPlayer.alive ? [...alivePlayers, wolfTargetPlayer] : alivePlayers
  // 予言者は自分自身を予言対象にできない。予言は襲撃と同じ夜に行うため、今夜の襲撃先も対象に含める
  // （AI予言者は今夜の襲撃先を知らずに選ぶ）。
  const seerCandidates = guardBaseCandidates.filter((p) => p.id !== trueSeer?.id)
  // 自分自身の護衛と、前夜と同じ対象への連続護衛は禁止する。
  const prevNightGuardTarget = game.nightRecords.find((n) => n.day === game.day - 1)?.bodyguard?.targetId
  const guardCandidates = guardBaseCandidates.filter((p) => p.id !== trueGuard?.id && p.id !== prevNightGuardTarget)

  // 霊媒対象はその日の処刑者に固定。GMが選ぶ余地はなくシステムが自動で処理する。
  const dayResolved = game.voteRounds.filter((r) => r.day === game.day && r.resolved && r.executedId)
  const mediumTarget = dayResolved.length > 0 ? dayResolved[dayResolved.length - 1].executedId! : ''

  const [wolfTarget, setWolfTarget] = useState<PlayerId>('')
  const [seerTarget, setSeerTarget] = useState<PlayerId>('')
  const [guardTarget, setGuardTarget] = useState<PlayerId>('')

  const wolfDone = !!night?.wolf
  const seerDone = !!night?.seer || !!night?.seerSkipped
  const mediumDone = !!night?.medium || !!night?.mediumSkipped
  const guardDone = !!night?.bodyguard || !!night?.guardSkipped

  // 真の予言者がすでに死亡している場合は、人狼の処理後に自動でスキップする。
  useEffect(() => {
    if (!wolfDone || seerDone) return
    if (isAlreadyDeadBeforeTonight(trueSeer)) skipSeerAction(game.day)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wolfDone, seerDone, trueSeer?.alive, trueSeer?.death, game.day])

  // 霊媒はGMの入力を待たず、予言の処理が終わった時点で自動的に記録（対象なしなら自動スキップ）する。
  useEffect(() => {
    if (!seerDone || mediumDone) return
    if (mediumTarget) {
      setMediumAction({ day: game.day, targetId: mediumTarget })
    } else {
      skipMediumAction(game.day)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seerDone, mediumDone, mediumTarget, game.day])

  // 真の狩人がすでに死亡している場合は、霊媒の処理後に自動でスキップする。
  useEffect(() => {
    if (!mediumDone || guardDone) return
    if (isAlreadyDeadBeforeTonight(trueGuard)) skipGuardAction(game.day)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediumDone, guardDone, trueGuard?.alive, trueGuard?.death, game.day])

  // AIの夜行動（5-2）。人間の人狼が生きている間は、AI人狼は仲間の襲撃先に従う（5-4-2）。
  const aliveWolves = game.players.filter((p) => p.alive && p.actualRole === 'wolf')
  const aiWolf = aliveWolves.find((p) => p.isAi)
  const aiDecidesWolf = !!aiWolf && aliveWolves.every((p) => p.isAi)
  const aiSeerTurn = !!trueSeer?.isAi && wolfDone && !seerDone && !isAlreadyDeadBeforeTonight(trueSeer)
  const aiGuardTurn = !!trueGuard?.isAi && mediumDone && !guardDone && !isAlreadyDeadBeforeTonight(trueGuard)
  const aiDecisionOf = (kind: AiNightActionKind) => game.aiNightDecisions?.find((d) => d.day === game.day && d.kind === kind)
  const pendingAi = [
    aiDecidesWolf && !wolfDone && game.phase === 'night' && !game.finished ? `wolf:${aiWolf!.id}` : '',
    aiSeerTurn ? `seer:${trueSeer!.id}` : '',
    aiGuardTurn ? `guard:${trueGuard!.id}` : '',
  ]
    .filter((k) => k && !aiDecisionOf(k.split(':')[0] as AiNightActionKind))
    .join(',')
  useEffect(() => {
    if (!pendingAi) return
    for (const k of pendingAi.split(',')) {
      const [kind, id] = k.split(':')
      decideAiNightAction(kind as AiNightActionKind, id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAi])

  function aiSuggestion(kind: AiNightActionKind, active: boolean, candidates: { id: PlayerId }[], apply: (targetId: PlayerId) => void) {
    const d = aiDecisionOf(kind)
    if (!active || !d) return null
    const legal = candidates.some((c) => c.id === d.targetId)
    return (
      <div className="ai-vote-notice due">
        <div>
          <b>AI {nameOf(d.aiId)}</b> の選択: <b>{nameOf(d.targetId)}</b>
        </div>
        <details>
          <summary>判断理由（GM専用・非公開）</summary>
          <ul className="ai-reasons">
            {d.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <div className="hint">判断方式: {d.policyVersion}</div>
        </details>
        {legal ? (
          <button onClick={() => apply(d.targetId)}>AIの選択で記録</button>
        ) : (
          <span className="hint error">AIの選択が現在の候補にありません。手動で入力してください。</span>
        )}
      </div>
    )
  }

  const roleName = (r: string) => game.meta.roleNames[r as keyof typeof game.meta.roleNames] ?? r
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.displayName ?? id
  const resultText = (r: 'wolf' | 'not-wolf') => formatWolfResult(r, game.meta.resultLabelStyle)

  // 予言者は同じ人を2回見ることはほとんどないため、既に分かっている対象は
  // プルダウンの選択肢に結果を書き添える（例：プレイヤー7（初日白）、プレイヤー6（2日目黒））。
  function seerHistoryHint(playerId: PlayerId): string | null {
    if (playerId === game.day1WhiteNotice) return '初日白'
    const past = game.nightRecords
      .filter((n) => n.seer?.targetId === playerId)
      .sort((a, b) => b.day - a.day)[0]
    if (!past?.seer) return null
    return `${past.day}日目${formatWolfResult(past.seer.result, 'black-white')}`
  }

  if (game.finished) {
    return (
      <div className="screen">
        <section className="card">
          <h2>夜の行動</h2>
          <p>勝敗がすでに確定しているため、夜フェイズは進行しません。</p>
        </section>
      </div>
    )
  }

  if (game.phase !== 'night') {
    return (
      <div className="screen">
        <section className="card">
          <h2>夜の行動</h2>
          <p className="hint">現在は昼フェイズです。投票が確定すると夜フェイズに移行します。</p>
        </section>
      </div>
    )
  }

  return (
    <div className="screen">
      <section className="card">
        <h2>実役職一覧</h2>
        <RoleRoster />
      </section>

      <section className="card">
        <h2>予言・霊媒結果の履歴</h2>
        {!game.day1WhiteNotice && game.nightRecords.filter((n) => n.seer || n.medium).length === 0 ? (
          <p className="hint">まだ結果はありません。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日</th>
                <th>{roleName('seer')}</th>
                <th>{roleName('medium')}</th>
              </tr>
            </thead>
            <tbody>
              {game.day1WhiteNotice && (
                <tr>
                  <td>初日</td>
                  <td>{nameOf(game.day1WhiteNotice)} → 初日白</td>
                  <td>－</td>
                </tr>
              )}
              {game.nightRecords
                .filter((n) => n.seer || n.seerSkipped || n.medium || n.mediumSkipped)
                .sort((a, b) => a.day - b.day)
                .map((n) => (
                  <tr key={n.day}>
                    <td>{n.day}日目</td>
                    <td>
                      {n.seer
                        ? `${nameOf(n.seer.targetId)} → ${resultText(n.seer.result)}`
                        : n.seerSkipped
                          ? '（対象なし）'
                          : '－'}
                    </td>
                    <td>
                      {n.medium
                        ? `${nameOf(n.medium.targetId)} → ${resultText(n.medium.result)}`
                        : n.mediumSkipped
                          ? '（対象なし）'
                          : '－'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{game.day}日目 夜の行動</h2>
          <button disabled={game.history.length === 0} onClick={() => undo()}>
            入力ミスを1つ戻す
          </button>
        </div>
        <p className="hint">
          処理順は固定です：{roleName('wolf')} → {roleName('seer')} → {roleName('medium')} → {roleName('bodyguard')}。
          前の役職の処理が終わるまで、次の役職は入力できません（狩人の護衛成否は人狼の襲撃先が決まって初めて判定できるため）。
          予言・霊媒の判定結果、護衛・襲撃の成否はGMが選ばず、真の役職・襲撃先からシステムが自動判定します。霊媒は対象が自動で決まるため入力自体が不要です。
        </p>

        <div className="row night-step">
          <b>1. {roleName('wolf')}の襲撃</b>
          {!wolfDone && aiWolf && !aiDecidesWolf && <span className="hint">（AI {aiWolf.displayName} は人間の仲間が決めた襲撃先に従います）</span>}
          {!wolfDone && aiSuggestion('wolf', aiDecidesWolf, wolfCandidates, (t) => setWolfAction({ day: game.day, targetId: t }))}
          {wolfDone ? (
            <span className="night-result">記録済み: {nameOf(night!.wolf!.targetId)} を襲撃</span>
          ) : (
            <>
              <select value={wolfTarget || wolfCandidates[0]?.id || ''} onChange={(e) => setWolfTarget(e.target.value)}>
                {wolfCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <button onClick={() => setWolfAction({ day: game.day, targetId: wolfTarget || wolfCandidates[0]?.id || '' })}>
                記録
              </button>
            </>
          )}
        </div>

        <div className="row night-step">
          <b>2. {roleName('seer')}の予言</b>
          {!wolfDone && <span className="hint">（{roleName('wolf')}の処理が終わるまで入力できません）</span>}
          {night?.seer && (
            <span className="night-result">
              記録済み: {nameOf(night.seer.targetId)} → {resultText(night.seer.result)}
            </span>
          )}
          {night?.seerSkipped && <span className="night-result">予言者はすでに死亡（自動スキップ）</span>}
          {aiSuggestion('seer', aiSeerTurn, seerCandidates, (t) => setSeerAction({ day: game.day, targetId: t }))}
          {!seerDone && wolfDone && (
            <>
              <select value={seerTarget || seerCandidates[0]?.id || ''} onChange={(e) => setSeerTarget(e.target.value)} disabled={!wolfDone}>
                {seerCandidates.map((p) => {
                  const hint = seerHistoryHint(p.id)
                  return (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                      {hint ? `（${hint}）` : ''}
                      {!p.alive && '（人狼に襲撃された人）'}
                    </option>
                  )
                })}
              </select>
              <button
                disabled={!wolfDone}
                onClick={() => setSeerAction({ day: game.day, targetId: seerTarget || seerCandidates[0]?.id || '' })}
              >
                記録
              </button>
            </>
          )}
        </div>

        <div className="row night-step">
          <b>3. {roleName('medium')}の霊媒（その日の処刑者が対象・自動処理）</b>
          {!seerDone && <span className="hint">（{roleName('seer')}の処理が終わるまで処理されません）</span>}
          {night?.medium && (
            <span className="night-result">
              自動記録: {nameOf(night.medium.targetId)} → {resultText(night.medium.result)}
            </span>
          )}
          {night?.mediumSkipped && <span className="night-result">処刑者がいないため対象なし（自動スキップ）</span>}
        </div>

        <div className="row night-step">
          <b>4. {roleName('bodyguard')}の護衛</b>
          {!mediumDone && <span className="hint">（{roleName('medium')}の処理が終わるまで入力できません）</span>}
          {night?.bodyguard && (
            <span className="night-result">
              記録済み: {nameOf(night.bodyguard.targetId)} を護衛 →{' '}
              {night.bodyguard.success ? '護衛成功（襲撃を防いだ）' : '護衛失敗（襲撃対象とは別）'}
            </span>
          )}
          {night?.guardSkipped && <span className="night-result">狩人はすでに死亡（自動スキップ）</span>}
          {aiSuggestion('guard', aiGuardTurn, guardCandidates, (t) => setBodyguardAction({ day: game.day, targetId: t }))}
          {!guardDone && mediumDone && (
            <>
              <select value={guardTarget || guardCandidates[0]?.id || ''} onChange={(e) => setGuardTarget(e.target.value)} disabled={!mediumDone}>
                {guardCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                    {!p.alive && '（人狼に襲撃された人）'}
                  </option>
                ))}
              </select>
              <button
                disabled={!mediumDone}
                onClick={() => setBodyguardAction({ day: game.day, targetId: guardTarget || guardCandidates[0]?.id || '' })}
              >
                記録
              </button>
            </>
          )}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button
            disabled={!guardDone}
            onClick={() => {
              advanceToNextDay()
              onNextDay?.()
            }}
          >
            翌日（{game.day + 1}日目）の昼へ →
          </button>
          {!guardDone && <span className="hint">（{roleName('bodyguard')}の処理が終わるまで進めません）</span>}
        </div>
      </section>
    </div>
  )
}
