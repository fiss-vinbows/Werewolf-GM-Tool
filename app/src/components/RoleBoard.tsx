import { useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_ROLE_NAMES, ROLE_LAYOUT_ROWS, roleCountsFor, type Player, type PlayerId, type RoleKey } from '../domain/types'
import { startDragAutoScroll } from './dragAutoScroll'

type DropZoneKey = RoleKey | 'pool'

// マウス・タッチの両方に対応する、ライブラリなしの独自ドラッグ操作。
// pointerdown で追跡を開始し、pointerup 時点でカーソル直下のドロップ先を判定する。
// 役職確認順（3章）：人狼→予言者→霊媒師→狩人→狂人の順で確定させ、残りを村人にする。
// 前の役職が人数分揃うまで、次の役職エリアへは割り振れないようにする。
const STAGE_ORDER: RoleKey[] = ['wolf', 'seer', 'medium', 'bodyguard', 'madman', 'villager']

export function RoleBoard() {
  const game = useGameStore((s) => s.game)
  const setActualRole = useGameStore((s) => s.setActualRole)
  const setDay1WhiteNotice = useGameStore((s) => s.setDay1WhiteNotice)
  const roleCounts = roleCountsFor(game.players.length)

  const [ghost, setGhost] = useState<{ player: Player; x: number; y: number } | null>(null)
  const draggingRef = useRef<PlayerId | null>(null)

  const assignedCount: Record<RoleKey, number> = { villager: 0, wolf: 0, madman: 0, seer: 0, medium: 0, bodyguard: 0 }
  for (const p of game.players) if (p.actualRole) assignedCount[p.actualRole]++

  // ある役職エリアが解禁されているか：それより前の段階の役職がすべて必要人数分揃っているか。
  // 揃っていなければ、最初に止まっている役職も返す（案内表示用）。
  function unlockStatus(role: RoleKey): { unlocked: boolean; blockedBy: RoleKey | null } {
    const idx = STAGE_ORDER.indexOf(role)
    for (let i = 0; i < idx; i++) {
      const prev = STAGE_ORDER[i]
      if (assignedCount[prev] < roleCounts[prev]) return { unlocked: false, blockedBy: prev }
    }
    return { unlocked: true, blockedBy: null }
  }

  const pool = game.players.filter((p) => !p.actualRole).sort((a, b) => a.registrationOrder - b.registrationOrder)

  function roleName(role: RoleKey) {
    return game.meta.roleNames[role] ?? DEFAULT_ROLE_NAMES[role]
  }

  function handlePointerDown(e: React.PointerEvent, player: Player) {
    e.preventDefault()
    draggingRef.current = player.id
    setGhost({ player, x: e.clientX, y: e.clientY })

    // ドラッグ中に画面の上端・下端へ近づいたら自動スクロールする（スマートフォン対応）。
    const scroller = startDragAutoScroll()

    const handleMove = (ev: PointerEvent) => {
      scroller.update(ev.clientY)
      if (!draggingRef.current) return
      setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g))
    }
    const handleUp = (ev: PointerEvent) => {
      scroller.stop()
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      const playerId = draggingRef.current
      draggingRef.current = null
      setGhost(null)
      if (!playerId) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const zone = el?.closest('[data-dropzone]') as HTMLElement | null
      const dropKey = zone?.dataset.dropzone as DropZoneKey | undefined
      if (!dropKey) return
      setActualRole(playerId, dropKey === 'pool' ? null : (dropKey as RoleKey))
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    // ブラウザがドラッグを中断した場合もドラッグを終える。
    window.addEventListener('pointercancel', handleUp)
  }

  function Chip({ player }: { player: Player }) {
    return (
      <div
        className={`chip${draggingRef.current === player.id ? ' chip-dragging' : ''}`}
        onPointerDown={(e) => handlePointerDown(e, player)}
        style={{ touchAction: 'none' }}
      >
        {player.displayName}
        {player.isAi && <span className="chip-ai">AI</span>}
      </div>
    )
  }

  // 予言者の枠の右側に表示する初日白（予言者への通知対象）。手動モードではここで選ぶ。
  function renderDay1White() {
    const notice = game.players.find((p) => p.id === game.day1WhiteNotice)
    return (
      <div className="day1-white" title={`人狼以外の1人として、GMから${roleName('seer')}へ口頭で伝えてください。`}>
        <span>初日白</span>
        {game.meta.day1WhiteNoticeMode === 'manual' ? (
          <select
            aria-label="初日白"
            value={game.day1WhiteNotice ?? ''}
            onChange={(e) => setDay1WhiteNotice(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">（未選択）</option>
            {game.players
              .filter((p) => p.actualRole !== 'wolf' && p.actualRole !== 'seer')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
          </select>
        ) : notice ? (
          <b>{notice.displayName}</b>
        ) : (
          <span className="hint">（自動抽選待ち）</span>
        )}
      </div>
    )
  }

  return (
    <div className="role-board">
      <p className="hint">プレイヤーをドラッグして役職エリアへ割り振ってください。未確認へ戻すには上のプール欄へドラッグします。</p>

      <div className="dropzone pool" data-dropzone="pool">
        <div className="dropzone-label">未確認（{pool.length}）</div>
        <div className="chip-row">
          {pool.map((p) => (
            <Chip key={p.id} player={p} />
          ))}
          {pool.length === 0 && <span className="hint">なし</span>}
        </div>
      </div>

      {ROLE_LAYOUT_ROWS.map((row, i) => (
        <div className="role-grid" key={i}>
          {row.map((role) => {
            const members = game.players
              .filter((p) => p.actualRole === role)
              .sort((a, b) => a.registrationOrder - b.registrationOrder)
            const over = members.length > roleCounts[role]
            const { unlocked, blockedBy } = unlockStatus(role)
            return (
              <div
                key={role}
                className={`dropzone role-zone role-zone-${role}${over ? ' over' : ''}${unlocked ? '' : ' locked'}`}
                data-dropzone={role}
                style={unlocked ? undefined : { pointerEvents: 'none' }}
              >
                <div className="dropzone-label">
                  {roleName(role)}（{members.length}/{roleCounts[role]}）
                  {blockedBy && <span className="hint">　先に{roleName(blockedBy)}を確定してください</span>}
                </div>
                {role === 'seer' ? (
                  <div className="seer-zone-body">
                    <div className="chip-row">
                      {members.map((p) => (
                        <Chip key={p.id} player={p} />
                      ))}
                    </div>
                    {renderDay1White()}
                  </div>
                ) : (
                  <div className="chip-row">
                    {members.map((p) => (
                      <Chip key={p.id} player={p} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {ghost && (
        <div className="chip chip-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.player.displayName}
        </div>
      )}
    </div>
  )
}
