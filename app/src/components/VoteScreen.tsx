import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { ROLE_COLORS } from '../domain/roleColors'
import { DEFAULT_ROLE_NAMES, type Player, type PlayerId, type RoleKey, type VoteRound } from '../domain/types'
import { PlayerName } from './PlayerName'
import { isGivingLastWords } from '../domain/speech'
import { formatWolfResult } from '../domain/resultLabel'
import { startDragAutoScroll } from './dragAutoScroll'
import { HelpNote } from './HelpNote'

const ROLE_ORDER: RoleKey[] = ['wolf', 'madman', 'seer', 'medium', 'bodyguard', 'villager']

function roleColorOf(p: Player): string {
  return ROLE_COLORS[p.actualRole ?? 'villager']
}

export function VoteScreen({ onGoToNight }: { onGoToNight?: () => void }) {
  const game = useGameStore((s) => s.game)
  const startVoteRound = useGameStore((s) => s.startVoteRound)

  const alivePlayers = game.players.filter((p) => p.alive)
  const rounds = game.voteRounds.filter((r) => r.day === game.day)
  const latestRoundResolved = rounds.length > 0 && rounds[rounds.length - 1].resolved

  // 投票ラウンドはGMが「開始」を押さず、この画面に来た時点で自動的に開始する。
  // StrictModeでのeffect二重実行や連続レンダーで二重作成しないよう、日付単位でrefガードする。
  const autoStartedForDay = useRef<number | null>(null)
  useEffect(() => {
    if (rounds.length > 0) {
      autoStartedForDay.current = game.day
      return
    }
    if (autoStartedForDay.current === game.day) return
    autoStartedForDay.current = game.day
    startVoteRound({
      day: game.day,
      kind: 'normal',
      aiOrder: game.meta.defaultAiOrder,
      candidateIds: alivePlayers.map((p) => p.id),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.length, game.day])

  return (
    <div className="screen">
      {rounds.map((round) => (
        <VoteRoundBoard key={round.id} round={round} alivePlayers={alivePlayers} />
      ))}

      {latestRoundResolved && <LastWordsPanel />}

      {latestRoundResolved && game.finished && (
        <section className="card">
          <p>処刑結果により勝敗が確定しました。夜フェイズには進みません。</p>
        </section>
      )}
      {latestRoundResolved && !game.finished && (
        <section className="card">
          <button onClick={() => onGoToNight?.()}>処刑結果が確定しました。夜フェイズへ →</button>
        </section>
      )}
    </div>
  )
}

function VoteRoundBoard({ round, alivePlayers }: { round: VoteRound; alivePlayers: Player[] }) {
  const game = useGameStore((s) => s.game)
  const castVote = useGameStore((s) => s.castVote)
  const removeVote = useGameStore((s) => s.removeVote)
  const castRemainingVotes = useGameStore((s) => s.castRemainingVotes)
  const finalizeVoteRound = useGameStore((s) => s.finalizeVoteRound)
  const addCoRecord = useGameStore((s) => s.addCoRecord)
  const changeCoRecord = useGameStore((s) => s.changeCoRecord)
  const decideAiVote = useGameStore((s) => s.decideAiVote)
  const redecideAiVote = useGameStore((s) => s.redecideAiVote)
  const announceAiVote = useGameStore((s) => s.announceAiVote)

  const [ghost, setGhost] = useState<{ label: string; color: string; x: number; y: number } | null>(null)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  // 役職ラベルをドラッグ中に、投票済みの名前（投票者）の上にあるとき、その投票者のID。
  const [hoverVoter, setHoverVoter] = useState<string | null>(null)
  const draggingRef = useRef<{ kind: 'vote'; voterId: PlayerId } | { kind: 'co'; role: RoleKey } | null>(null)

  const voters = round.kind === 'normal' ? alivePlayers : alivePlayers.filter((p) => !round.candidateIds.includes(p.id))
  const targets = round.kind === 'normal' ? alivePlayers : round.candidateIds.map((id) => game.players.find((p) => p.id === id)!)
  const votedVoterIds = new Set(round.votes.map((v) => v.voterId))
  const unvoted = voters.filter((v) => !votedVoterIds.has(v.id))

  // 処刑対象は最多得票者から自動判別する。同数の場合は確定操作で自動的に次の決選ラウンドへ進む。
  const counts = targets.map((t) => ({ id: t.id, name: t.displayName, count: round.votes.filter((v) => v.targetId === t.id).length }))
  const maxCount = Math.max(0, ...counts.map((c) => c.count))
  const leaders = counts.filter((c) => c.count === maxCount && maxCount > 0)

  // AIの投票順と判断タイミング（4-4・4-4-2）。通常投票は中央順、決選投票は人間の票を見る前に固定する。
  const aiVoters = voters.filter((v) => v.isAi).sort((a, b) => a.registrationOrder - b.registrationOrder)
  const aiSlots = aiVoters.map((ai, i) => {
    const slot = round.kind === 'normal' ? Math.min((round.aiOrder ?? 1) + i, voters.length) : null
    const votedCount = round.votes.filter((v) => v.voterId !== ai.id).length
    const due = !round.resolved && !votedVoterIds.has(ai.id) && (slot === null || votedCount >= slot - 1)
    const decision = round.aiDecisions?.find((d) => d.aiId === ai.id && d.status !== 'superseded')
    return { ai, slot, due, remaining: slot === null ? 0 : Math.max(0, slot - 1 - votedCount), decision }
  })
  const dueWithoutDecision = aiSlots.filter((s) => s.due && !s.decision).map((s) => s.ai.id).join(',')
  useEffect(() => {
    if (!dueWithoutDecision) return
    for (const id of dueWithoutDecision.split(',')) decideAiVote(round.id, id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueWithoutDecision, round.id])

  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? DEFAULT_ROLE_NAMES[r]

  function recordCoDuringVote(playerId: PlayerId, role: RoleKey) {
    const target = game.players.find((p) => p.id === playerId)
    if (!target?.alive) return
    const existing = game.coRecords.find((c) => c.playerId === playerId && c.status === 'active')
    const afterVoteCount = game.voteEventCounter
    if (existing) {
      if (existing.claimedRole === role) return
      changeCoRecord({ previousCoId: existing.id, playerId, claimedRole: role, day: game.day, afterVoteCount })
    } else {
      addCoRecord({ playerId, claimedRole: role, day: game.day, afterVoteCount })
    }
  }

  const zoneAttrName = `data-votezone-${round.id}`

  function startDrag(e: React.PointerEvent, dragging: { kind: 'vote'; voterId: PlayerId } | { kind: 'co'; role: RoleKey }, label: string, color: string) {
    if (round.resolved && dragging.kind === 'vote') return
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = dragging
    setGhost({ label, color, x: e.clientX, y: e.clientY })

    // ドラッグ中に画面の上端・下端へ近づいたら自動スクロールする（スマートフォン対応）。
    let lastX = e.clientX
    let lastY = e.clientY
    // 指の下のドロップ先をハイライトする。役職ラベルのときは投票済みの名前（投票者）を優先する。
    const updateHover = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const voter = dragging.kind === 'co' ? (el?.closest('[data-voterco]') as HTMLElement | null) : null
      setHoverVoter(voter?.dataset.voterco ?? null)
      const zone = voter ? null : (el?.closest(`[${zoneAttrName}]`) as HTMLElement | null)
      setHoverTarget(zone?.getAttribute(zoneAttrName) ?? null)
    }
    const scroller = startDragAutoScroll(() => updateHover(lastX, lastY))

    const handleMove = (ev: PointerEvent) => {
      lastX = ev.clientX
      lastY = ev.clientY
      scroller.update(ev.clientY)
      if (!draggingRef.current) return
      setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g))
      updateHover(ev.clientX, ev.clientY)
    }
    const handleUp = (ev: PointerEvent) => {
      scroller.stop()
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      const drag = draggingRef.current
      draggingRef.current = null
      setGhost(null)
      setHoverTarget(null)
      setHoverVoter(null)
      if (!drag) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      // 役職ラベルを投票済みの名前に置いたら、その投票者のCOとして記録する（投票先を言ってからCOする場合）。
      const voterEl = drag.kind === 'co' ? (el?.closest('[data-voterco]') as HTMLElement | null) : null
      if (drag.kind === 'co' && voterEl?.dataset.voterco) {
        recordCoDuringVote(voterEl.dataset.voterco, drag.role)
        return
      }
      const zone = el?.closest(`[${zoneAttrName}]`) as HTMLElement | null
      const targetId = zone?.getAttribute(zoneAttrName)
      if (!targetId) return
      if (drag.kind === 'vote') {
        if (targetId === drag.voterId) return // 自分自身には投票できない。
        castVote(round.id, { voterId: drag.voterId, targetId })
      } else {
        recordCoDuringVote(targetId, drag.role)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    // ブラウザがドラッグを中断した場合もドラッグを終える。
    window.addEventListener('pointercancel', handleUp)
  }

  // COしている人は、名前をCOした役職の色の枠で囲んで示す（2026-10-09）。
  function coOutlineProps(playerId: PlayerId): { className: string; style?: React.CSSProperties; title?: string } {
    const co = game.coRecords.find((c) => c.playerId === playerId && c.status === 'active')
    if (!co) return { className: '' }
    return { className: ' co-outline', style: { ['--co-color' as string]: ROLE_COLORS[co.claimedRole] }, title: `CO: ${roleName(co.claimedRole)}` }
  }

  return (
    <section className="card">
      <h3>
        {round.kind === 'normal' ? '通常投票' : round.kind === 'runoff1' ? '決選投票1回目' : '決選投票2回目'}
        {round.aiOrder ? `　AI順: ${round.aiOrder}番目` : ''}
        {round.resolved ? '　【確定済み】' : ''}
      </h3>
      <HelpNote id="vote">
        左の未投票プレイヤーを、右の投票先へドラッグしてください。役職ラベルをプレイヤーへドラッグすると、投票中のCO（何票目の後かも記録）ができます。
        投票先の枠の中に並んだ投票済みの名前に役職ラベルを置くと、投票先ではなくその投票者本人のCOとして記録します。
        {round.kind !== 'normal' && '決選投票では、少数派だけをドラッグしたあと「残りを一括投票」でもう一方に全員投票させると時短になります。'}
      </HelpNote>

      <div className="co-source-row">
        {ROLE_ORDER.map((role) => (
          <div
            key={role}
            className="co-chip"
            style={{ background: ROLE_COLORS[role], cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => startDrag(e, { kind: 'co', role }, roleName(role), ROLE_COLORS[role])}
          >
            {roleName(role)}
          </div>
        ))}
      </div>

      {aiSlots.length > 0 && !round.resolved && (
        <div className="ai-vote-panel">
          {aiSlots.map(({ ai, slot, due, remaining, decision }) => {
            const target = decision && game.players.find((p) => p.id === decision.targetId)
            return (
              <div key={ai.id} className={`ai-vote-notice${due ? ' due' : ''}`}>
                <div>
                  <b>AI {ai.displayName}</b>
                  {slot !== null && `（${slot}番目に投票）`}
                  {decision?.status === 'announced' && '：発表済み'}
                  {!due && !decision && slot !== null && `：あと${remaining}票入力するとAIの番です`}
                </div>
                {decision && target && (
                  <>
                    <div className="ai-vote-target">
                      投票先: <PlayerName player={target} />
                    </div>
                    <details>
                      <summary>判断理由（GM専用・非公開）</summary>
                      <ul className="ai-reasons">
                        {decision.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                      <div className="hint">
                        判断方式: {decision.policyVersion}／判断時点の公開票: {decision.visibleVoteCount}票
                      </div>
                    </details>
                    {decision.status === 'shown' && (
                      <div className="row">
                        <button onClick={() => announceAiVote(round.id, ai.id)}>発表済み（AI票を確定）</button>
                        <button onClick={() => redecideAiVote(round.id, ai.id)}>現時点の情報で再判断</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="vote-columns">
        <div className="vote-pool">
          <div className="dropzone-label">未投票（{unvoted.length}）</div>
          <div className="chip-row">
            {unvoted.map((v) => (
              <div key={v.id} {...{ [zoneAttrName]: v.id }} className={`chip-with-co${hoverTarget === v.id ? ' drop-hover' : ''}`}>
                <div
                  className={`chip${coOutlineProps(v.id).className}`}
                  style={{ background: roleColorOf(v), touchAction: 'none', ...coOutlineProps(v.id).style }}
                  title={coOutlineProps(v.id).title}
                  onPointerDown={(e) => startDrag(e, { kind: 'vote', voterId: v.id }, v.displayName, roleColorOf(v))}
                >
                  <PlayerName player={v} />
                </div>
              </div>
            ))}
            {unvoted.length === 0 && <span className="hint">なし</span>}
          </div>
        </div>

        <div className="vote-targets">
          {targets.map((t) => {
            const votesForTarget = round.votes.filter((v) => v.targetId === t.id).sort((a, b) => a.order - b.order)
            return (
              <div
                key={t.id}
                className={`dropzone vote-target-zone${hoverTarget === t.id ? ' drop-hover' : ''}`}
                {...{ [zoneAttrName]: t.id }}
                style={{ ['--target-color' as string]: roleColorOf(t) }}
              >
                <div className="dropzone-label">
                  <span className={`target-name${coOutlineProps(t.id).className}`} style={coOutlineProps(t.id).style} title={coOutlineProps(t.id).title}>
                    <PlayerName player={t} />
                  </span>
                  （{votesForTarget.length}票）
                </div>
                <div className="chip-row">
                  {votesForTarget.map((v, i) => {
                    const voter = game.players.find((p) => p.id === v.voterId)
                    return (
                      <div
                        key={v.voterId}
                        // 投票済みの名前に役職ラベルを置くと、投票先ではなく投票者本人のCOとして記録する。
                        data-voterco={v.voterId}
                        className={`chip chip-vote${coOutlineProps(v.voterId).className}${hoverVoter === v.voterId ? ' drop-hover' : ''}`}
                        style={{ background: voter ? roleColorOf(voter) : undefined, ...coOutlineProps(v.voterId).style }}
                        title={`このラウンドで${i + 1}番目／ゲーム全体で${v.globalOrder}番目に投票`}
                        onClick={() => !round.resolved && removeVote(round.id, v.voterId)}
                      >
                        {i + 1}(全{v.globalOrder}). {voter && <PlayerName player={voter} />}
                      </div>
                    )
                  })}
                </div>
                {!round.resolved && round.kind !== 'normal' && unvoted.length > 0 && (
                  <button
                    className="bulk-vote-btn"
                    onClick={() => castRemainingVotes(round.id, voters.map((v) => v.id), t.id)}
                  >
                    残り（{unvoted.length}人）を一括投票
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {ghost && (
        <div className="co-chip chip-ghost" style={{ left: ghost.x, top: ghost.y, background: ghost.color }}>
          {ghost.label}
        </div>
      )}

      {!round.resolved && (
        <div className="row" style={{ marginTop: 10 }}>
          {unvoted.length > 0 && <span className="hint error">未投票が{unvoted.length}人います。全員の投票が終わるまで確定できません。</span>}
          {unvoted.length === 0 && leaders.length === 0 && <span>投票なし → 処刑者なしで確定できます</span>}
          {unvoted.length === 0 && leaders.length === 1 && (
            <span>
              最多得票: {leaders[0].name}（{maxCount}票）
            </span>
          )}
          {unvoted.length === 0 && leaders.length > 1 && (
            <span>
              同数です（{maxCount}票）: {leaders.map((l) => l.name).join(' / ')}　確定すると自動的に決選投票へ進みます。
            </span>
          )}
          <button disabled={unvoted.length > 0} onClick={() => finalizeVoteRound(round.id)}>
            この結果で確定
          </button>
        </div>
      )}
      {round.resolved && (
        <p>結果: {round.executedId ? game.players.find((p) => p.id === round.executedId)?.displayName + ' 処刑' : '処刑者なし'}</p>
      )}
    </section>
  )
}

// 処刑者の遺言でのCOと結果の発表（夜フェイズへ進むまでの間だけ記録できる）。
// COした役職に応じて、予言者なら白・黒、霊媒師なら処刑者への白・黒、狩人なら○・Gをこの場で発表できる。
function LastWordsPanel() {
  const game = useGameStore((s) => s.game)
  const addCoRecord = useGameStore((s) => s.addCoRecord)
  const changeCoRecord = useGameStore((s) => s.changeCoRecord)
  const addJudgmentByDrag = useGameStore((s) => s.addJudgmentByDrag)
  const [targetId, setTargetId] = useState('')
  const executed = game.players.find((p) => isGivingLastWords(game, p.id))
  if (!executed) return null
  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? DEFAULT_ROLE_NAMES[r]
  const activeCo = game.coRecords.find((c) => c.playerId === executed.id && c.status === 'active')
  const coRole = activeCo?.claimedRole
  const judgeKind = coRole === 'seer' || coRole === 'medium' || coRole === 'bodyguard' ? coRole : null

  function record(role: RoleKey) {
    if (!executed) return
    setTargetId('')
    if (activeCo) {
      if (activeCo.claimedRole === role) return
      changeCoRecord({ previousCoId: activeCo.id, playerId: executed.id, claimedRole: role, day: game.day, note: '遺言' })
    } else {
      addCoRecord({ playerId: executed.id, claimedRole: role, day: game.day, note: '遺言' })
    }
  }

  // 発表できる対象：霊媒は処刑された人、予言と護衛先（○・G）は死亡者を含む全員（本人以外）。
  const targets = game.players.filter((p) => {
    if (p.id === executed.id) return false
    if (judgeKind === 'medium') return !p.alive && p.death?.trueCause === 'execution'
    return true
  })
  const claimKind = judgeKind === 'bodyguard' ? 'guard' : judgeKind
  const announced = game.resultClaims.filter((c) => c.speakerId === executed.id && c.kind === claimKind && !c.retracted)
  const resultLabel = (r: string) =>
    r === 'guarded' ? '○（護衛）' : r === 'guard-success' ? 'G（護衛成功）' : formatWolfResult(r as 'wolf' | 'not-wolf', game.meta.resultLabelStyle)

  function announce(result: 'wolf' | 'not-wolf' | 'guarded' | 'guard-success') {
    if (!executed || !judgeKind || !targetId) return
    addJudgmentByDrag(executed.id, targetId, result, judgeKind)
    setTargetId('')
  }

  return (
    <section className="card">
      <h2>遺言</h2>
      <p>
        処刑された <PlayerName player={executed} /> が遺言で役職をCOした場合に記録します。
        {activeCo && <>現在のCO：<strong>{roleName(activeCo.claimedRole)}</strong></>}
      </p>
      <div className="row">
        {ROLE_ORDER.map((r) => (
          <button key={r} style={{ borderColor: ROLE_COLORS[r] }} disabled={activeCo?.claimedRole === r} onClick={() => record(r)}>
            {roleName(r)}CO
          </button>
        ))}
      </div>

      {judgeKind && (
        <div style={{ marginTop: 12 }}>
          <h3>{roleName(judgeKind)}としての結果の発表</h3>
          <div className="row">
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: 180 }} aria-label="発表の対象">
              <option value="">対象を選ぶ</option>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                  {p.alive ? '' : '（死亡）'}
                </option>
              ))}
            </select>
            {judgeKind === 'bodyguard' ? (
              <>
                <button disabled={!targetId} onClick={() => announce('guarded')}>○（護衛した）</button>
                <button disabled={!targetId} onClick={() => announce('guard-success')}>G（護衛成功）</button>
              </>
            ) : (
              <>
                <button disabled={!targetId} onClick={() => announce('not-wolf')}>{formatWolfResult('not-wolf', game.meta.resultLabelStyle)}</button>
                <button disabled={!targetId} onClick={() => announce('wolf')}>{formatWolfResult('wolf', game.meta.resultLabelStyle)}</button>
              </>
            )}
          </div>
          {announced.length > 0 && (
            <ul>
              {announced.map((c) => (
                <li key={c.id}>
                  {game.players.find((p) => p.id === c.targetId)?.displayName}：{resultLabel(c.result)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="hint">夜フェイズへ進むと、遺言は記録できなくなります。結果の訂正は「昼・CO」タブの公表結果の履歴から行えます。</p>
    </section>
  )
}
