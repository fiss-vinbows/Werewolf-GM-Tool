import { useGameStore } from '../store/gameStore'
import { ROLE_COLORS } from '../domain/roleColors'
import { DEFAULT_ROLE_NAMES, ROLE_LAYOUT_ROWS, type RoleKey } from '../domain/types'
import { PlayerName } from './PlayerName'

// 昼のCOボードと同じ色分け・レイアウトで、実役職ごとの一覧を表示する（夜・保存画面用）。
export function RoleRoster() {
  const game = useGameStore((s) => s.game)
  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? DEFAULT_ROLE_NAMES[r]

  return (
    <div className="co-board">
      {ROLE_LAYOUT_ROWS.map((row, i) => (
        <div className="role-area-row" key={i}>
          {row.map((role) => {
            const members = game.players
              .filter((p) => p.actualRole === role)
              .sort((a, b) => a.registrationOrder - b.registrationOrder)
            if (members.length === 0) return null
            return (
              <div key={role} className="role-area" style={{ ['--area-color' as string]: ROLE_COLORS[role] }}>
                <div className="role-area-label">{roleName(role)}</div>
                <div className="player-drop-row">
                  {members.map((p) => (
                    <div key={p.id} className={`player-drop-target${!p.alive ? ' player-dead' : ''}`}>
                      <span className="player-name-label">
                        <PlayerName player={p} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
