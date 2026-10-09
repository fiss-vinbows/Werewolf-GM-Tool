import { useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { ROLE_COLORS } from '../domain/roleColors'
import { DEFAULT_ROLE_NAMES, ROLE_LAYOUT_ROWS, type Player, type PlayerId, type RoleKey } from '../domain/types'
import { PlayerName } from './PlayerName'
import { canSpeak } from '../domain/speech'
import { startDragAutoScroll } from './dragAutoScroll'
import { HelpNote } from './HelpNote'

const ROLE_ORDER: RoleKey[] = ['wolf', 'madman', 'seer', 'medium', 'bodyguard', 'villager']
// 予言者・霊媒師は白丸／黒丸の2アイコン、狩人は護衛順を示す○アイコン1つだけを使う（要求7・要求4）。
const TWO_ICON_ROLES: RoleKey[] = ['seer', 'medium']
const ONE_ICON_ROLE: RoleKey = 'bodyguard'
type JudgeKind = 'seer' | 'medium' | 'bodyguard'

type Dragging =
  | { kind: 'co'; role: RoleKey }
  | { kind: 'judge'; speakerId: PlayerId; judgeKind: JudgeKind; result: 'wolf' | 'not-wolf' | 'guarded' | 'guard-success' }

type MenuTarget = { kind: 'co' | 'claim'; id: string; x: number; y: number; canRetract: boolean }

// 役職ラベルをプレイヤーへドラッグしてCOを記録する。
// 元の実役職は色分けした領域で表示し、公開されているCOラベルとは別データとして扱う（4-3）。
export function CoBoard() {
  const game = useGameStore((s) => s.game)
  const addCoRecord = useGameStore((s) => s.addCoRecord)
  const changeCoRecord = useGameStore((s) => s.changeCoRecord)
  const retractCoRecord = useGameStore((s) => s.retractCoRecord)
  const eraseCoRecord = useGameStore((s) => s.eraseCoRecord)
  const retractResultClaim = useGameStore((s) => s.retractResultClaim)
  const eraseResultClaim = useGameStore((s) => s.eraseResultClaim)
  const addJudgmentByDrag = useGameStore((s) => s.addJudgmentByDrag)

  const [ghost, setGhost] = useState<{ label: string; color: string; x: number; y: number } | null>(null)
  const [hoverPlayerId, setHoverPlayerId] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const draggingRef = useRef<Dragging | null>(null)

  function roleName(role: RoleKey) {
    return game.meta.roleNames[role] ?? DEFAULT_ROLE_NAMES[role]
  }

  function recordCo(playerId: string, role: RoleKey) {
    if (!canSpeak(game, playerId)) return // 死亡したプレイヤーの記録は操作しない（遺言中を除く）。
    const existing = game.coRecords.find((c) => c.playerId === playerId && c.status === 'active')
    if (existing) {
      if (existing.claimedRole === role) return
      changeCoRecord({ previousCoId: existing.id, playerId, claimedRole: role, day: game.day })
    } else {
      addCoRecord({ playerId, claimedRole: role, day: game.day })
    }
  }

  function startDrag(e: React.PointerEvent, dragging: Dragging, label: string, color: string) {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = dragging
    setGhost({ label, color, x: e.clientX, y: e.clientY })

    // ドラッグ中に画面の上端・下端へ近づいたら自動スクロールする（スマートフォン対応）。
    let lastX = e.clientX
    let lastY = e.clientY
    const scroller = startDragAutoScroll(() => {
      const target = (document.elementFromPoint(lastX, lastY) as HTMLElement | null)?.closest('[data-playerdrop]') as HTMLElement | null
      setHoverPlayerId(target?.dataset.playerdrop ?? null)
    })

    const handleMove = (ev: PointerEvent) => {
      lastX = ev.clientX
      lastY = ev.clientY
      scroller.update(ev.clientY)
      if (!draggingRef.current) return
      setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g))
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const target = el?.closest('[data-playerdrop]') as HTMLElement | null
      setHoverPlayerId(target?.dataset.playerdrop ?? null)
    }
    const handleUp = (ev: PointerEvent) => {
      scroller.stop()
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      const drag = draggingRef.current
      draggingRef.current = null
      setGhost(null)
      setHoverPlayerId(null)
      if (!drag) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const target = el?.closest('[data-playerdrop]') as HTMLElement | null
      const playerId = target?.dataset.playerdrop
      if (!playerId) return
      if (drag.kind === 'co') {
        recordCo(playerId, drag.role)
      } else if (playerId !== drag.speakerId) {
        const targetPlayer = game.players.find((p) => p.id === playerId)
        if (!targetPlayer) return
        if (drag.judgeKind === 'medium') {
          // 霊媒は処刑されたプレイヤーだけに色を付けられる（襲撃で死亡した人は対象外）。
          if (targetPlayer.alive || targetPlayer.death?.trueCause !== 'execution') return
        }
        // 予言結果と護衛先は、すでに死亡したプレイヤーにも記録できる（前夜の予言先が襲撃された場合や、
        // 過去の結果を後から発表する場合のため。2026-10-09）。
        addJudgmentByDrag(drag.speakerId, playerId, drag.result, drag.judgeKind)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    // ブラウザがドラッグを中断した場合もドラッグを終える。
    window.addEventListener('pointercancel', handleUp)
  }

  function PlayerCard({ p }: { p: Player }) {
    const activeCo = game.coRecords.find((c) => c.playerId === p.id && c.status === 'active')
    const twoIconKind = activeCo && TWO_ICON_ROLES.includes(activeCo.claimedRole) ? (activeCo.claimedRole as 'seer' | 'medium') : null
    const oneIconKind = activeCo?.claimedRole === ONE_ICON_ROLE ? ('bodyguard' as const) : null
    // 予言者・霊媒師・狩人COした本人の「真の役職」色を背景にして、ドラッグ元の判定アイコンの信頼度を示す。
    const ownRoleColor = ROLE_COLORS[p.actualRole ?? 'villager']
    const judgments = game.resultClaims
      .filter((c) => (c.kind === 'guard' ? true : TWO_ICON_ROLES.includes(c.kind as RoleKey)) && c.targetId === p.id && !c.retracted)
      .sort((a, b) => a.eventOrder - b.eventOrder)

    const interactive = canSpeak(game, p.id) // 死亡したプレイヤーは新規のドラッグ起点にしない（遺言中を除く）。

    return (
      <div
        data-playerdrop={p.id}
        className={`player-drop-target${hoverPlayerId === p.id ? ' drop-hover' : ''}${!p.alive ? ' player-dead' : ''}`}
      >
        <div className="player-seer-row">
          {twoIconKind && interactive ? (
            <span
              className="judge-dot judge-dot-white"
              style={{ borderColor: ownRoleColor }}
              title="白丸をドラッグして人狼ではないと判定（縁の色はこの人の真の役職）"
              onPointerDown={(e) => startDrag(e, { kind: 'judge', speakerId: p.id, judgeKind: twoIconKind, result: 'not-wolf' }, '白', '#f2efe6')}
            />
          ) : oneIconKind && interactive ? (
            <span
              className="judge-dot"
              style={{ background: ownRoleColor }}
              title="○をドラッグして護衛したと主張する対象・順番を記録（丸の背景色はこの人の真の役職）"
              onPointerDown={(e) => startDrag(e, { kind: 'judge', speakerId: p.id, judgeKind: 'bodyguard', result: 'guarded' }, '○', ownRoleColor)}
            >
              ○
            </span>
          ) : (
            <span className="judge-dot-placeholder" />
          )}
          <span
            className={`player-name-label${activeCo ? ' co-outline' : ''}`}
            style={activeCo ? { ['--co-color' as string]: ROLE_COLORS[activeCo.claimedRole] } : undefined}
            title={activeCo ? `CO: ${roleName(activeCo.claimedRole)}（押すと撤回・誤記取り消し）` : undefined}
            onClick={
              activeCo
                ? (e) => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ kind: 'co', id: activeCo.id, x: rect.left, y: rect.bottom, canRetract: canSpeak(game, p.id) })
                  }
                : undefined
            }
          >
            <PlayerName player={p} />
          </span>
          {oneIconKind && interactive ? (
            <span
              className="judge-dot judge-dot-guard-success"
              style={{ background: ownRoleColor }}
              title="Gをドラッグして護衛に成功したと主張する対象を記録（丸の背景色はこの人の真の役職）"
              onPointerDown={(e) => startDrag(e, { kind: 'judge', speakerId: p.id, judgeKind: 'bodyguard', result: 'guard-success' }, 'G', ownRoleColor)}
            >
              G
            </span>
          ) : twoIconKind && interactive ? (
            <span
              className="judge-dot judge-dot-black"
              style={{ borderColor: ownRoleColor }}
              title="黒丸をドラッグして人狼と判定（縁の色はこの人の真の役職）"
              onPointerDown={(e) => startDrag(e, { kind: 'judge', speakerId: p.id, judgeKind: twoIconKind, result: 'wolf' }, '黒', '#1b1b1f')}
            />
          ) : (
            <span className="judge-dot-placeholder" />
          )}
        </div>


        {judgments.length > 0 && (
          <div className="judge-history">
            {judgments.map((j) => {
              const speaker = game.players.find((pl) => pl.id === j.speakerId)
              const speakerColor = ROLE_COLORS[speaker?.actualRole ?? 'villager']
              const kindLabel = roleName(j.kind === 'guard' ? 'bodyguard' : (j.kind as RoleKey)) + (j.result === 'guard-success' ? '（護衛成功）' : j.result === 'guarded' ? '（護衛）' : '')
              const isBinary = j.kind !== 'guard'
              const dotClass = isBinary ? (j.result === 'wolf' ? 'judge-history-dot judge-dot-black' : 'judge-history-dot judge-dot-white') : 'judge-history-dot'
              return (
                <span
                  key={j.id}
                  className={dotClass}
                  style={isBinary ? { borderColor: speakerColor } : { background: speakerColor }}
                  title={`${kindLabel}／${j.targetDay}人目に色付け（発言者: ${speaker?.displayName}／縁の色はその人の真の役職）`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    setMenu({ kind: 'claim', id: j.id, x: rect.left, y: rect.bottom, canRetract: !!speaker && canSpeak(game, speaker.id) })
                  }}
                >
                  {!isBinary && (j.result === 'guard-success' ? 'G' : '○')}
                </span>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="co-board">
      <HelpNote id="co-board">
        役職ラベルをプレイヤー名へドラッグするとCOを記録し、名前がその役職の色の枠で囲まれます。同じ人へ別の役職を重ねるとスライドとして記録します。枠で囲まれた名前を押すと、撤回・誤記取り消しができます。
        予言者・霊媒師CO した人は名前の両端に白丸／黒丸、狩人CO した人は左側に○（護衛先）・右側にG（護衛成功した先）が出るので、対象者へドラッグすると判定・護衛順を記録できます（記録した順番を対象日として扱います）。
        霊媒は処刑されたプレイヤーのみが対象です。予言結果と護衛先（○・G）は死亡したプレイヤーにも記録できます。COの新規記録は生存者にのみ行え、死亡したプレイヤーは撤回もできません。
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

      {ROLE_LAYOUT_ROWS.map((row, i) => (
        <div className="role-area-row" key={i}>
          {row.map((role) => {
            const members = game.players
              .filter((p) => p.actualRole === role)
              .sort((a, b) => a.registrationOrder - b.registrationOrder)
            if (members.length === 0) return null
            return (
              <div key={role} className="role-area" style={{ ['--area-color' as string]: ROLE_COLORS[role] }}>
                <div className="role-area-label">元の役職: {roleName(role)}</div>
                <div className="player-drop-row">
                  {members.map((p) => (
                    <PlayerCard key={p.id} p={p} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {ghost && (
        <div className="co-chip chip-ghost" style={{ left: ghost.x, top: ghost.y, background: ghost.color }}>
          {ghost.label}
        </div>
      )}

      {menu && (
        <>
          <div className="menu-backdrop" onClick={() => setMenu(null)} />
          <div className="mini-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.canRetract && (
              <button
                onClick={() => {
                  if (menu.kind === 'co') retractCoRecord(menu.id)
                  else retractResultClaim(menu.id)
                  setMenu(null)
                }}
              >
                撤回（本当に起きた）
              </button>
            )}
            <button
              onClick={() => {
                if (menu.kind === 'co') eraseCoRecord(menu.id)
                else eraseResultClaim(menu.id)
                setMenu(null)
              }}
            >
              誤記取り消し（入力ミス）
            </button>
            <button onClick={() => setMenu(null)}>キャンセル</button>
          </div>
        </>
      )}
    </div>
  )
}
