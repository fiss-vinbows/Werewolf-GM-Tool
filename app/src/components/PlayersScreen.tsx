import { useGameStore } from '../store/gameStore'
import {
  DEFAULT_ROLE_NAMES,
  ROLE_CONFIRM_ORDER,
  SUPPORTED_PLAYER_COUNTS,
  roleCountsFor,
  type RoleKey,
  type SupportedPlayerCount,
} from '../domain/types'
import { validateRoleAssignment } from '../domain/roleValidation'
import { RoleBoard } from './RoleBoard'
import { useRosterStore } from '../store/rosterStore'

// 「未確認を村人にする」は、それより前の段階（人狼→予言者→霊媒師→狩人→狂人）が
// すべて確定してから使えるようにする（役職確認順の途中で村人に丸められないようにする）。
const ROLES_BEFORE_VILLAGER: RoleKey[] = ['wolf', 'seer', 'medium', 'bodyguard', 'madman']

export function PlayersScreen({ onRegistered }: { onRegistered?: () => void }) {
  const game = useGameStore((s) => s.game)
  const setPlayerCount = useGameStore((s) => s.setPlayerCount)
  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const setPlayerIsAi = useGameStore((s) => s.setPlayerIsAi)
  const fillUnassignedAsVillager = useGameStore((s) => s.fillUnassignedAsVillager)
  const completeRegistration = useGameStore((s) => s.completeRegistration)
  const setDay1WhiteNotice = useGameStore((s) => s.setDay1WhiteNotice)

  const rosterMembers = useRosterStore((s) => s.members)
  // 名簿から手動で選ぶときの候補（出席者を先に表示し、他の席で使用中の名前は除く）
  const usedNames = new Set(game.players.map((p) => p.displayName))
  const rosterOptions = [...rosterMembers].sort((a, b) => Number(b.present) - Number(a.present))
  const humanCount = game.players.filter((p) => !p.isAi).length

  const unassignedCount = game.players.filter((p) => !p.actualRole).length
  const validation = validateRoleAssignment(game.players)
  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? DEFAULT_ROLE_NAMES[r]
  const roleCounts = roleCountsFor(game.players.length)
  const earlyStagesDone = ROLES_BEFORE_VILLAGER.every(
    (r) => game.players.filter((p) => p.actualRole === r).length >= roleCounts[r],
  )

  return (
    <div className="screen">
      <section className="card">
        <h2>プレイヤー登録（{game.players.length}人）</h2>
        <p>
          現在の参加者数：<strong>{game.players.length}人</strong>（人間{humanCount}人・AI{game.players.length - humanCount}人）
        </p>
        {game.phase === 'setup' ? (
          <label>
            参加人数
            <select
              value={game.meta.playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value) as SupportedPlayerCount)}
              style={{ width: 100 }}
            >
              {SUPPORTED_PLAYER_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}人
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hint">参加人数の変更は登録完了前のみ可能です。</p>
        )}
        <p className="hint">
          役職確認順: {ROLE_CONFIRM_ORDER.map((r) => game.meta.roleNames[r]).join(' → ')}
          　AI参加時は人間の役職確認前にAIの実役職を登録してください。
        </p>
        <table>
          <thead>
            <tr>
              <th>座席/順</th>
              <th>表示名</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((p) => (
              <tr key={p.id}>
                <td>{p.registrationOrder}</td>
                <td>
                  <div className="row">
                    <input value={p.displayName} onChange={(e) => setPlayerName(p.id, e.target.value)} />
                    {game.phase === 'setup' && rosterOptions.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => e.target.value && setPlayerName(p.id, e.target.value)}
                        style={{ width: 130 }}
                        aria-label="名簿から選ぶ"
                      >
                        <option value="">名簿から選ぶ</option>
                        {rosterOptions.map((m) => (
                          <option key={m.id} value={m.name} disabled={usedNames.has(m.name)}>
                            {m.name}
                            {m.present ? '' : '（欠席）'}
                            {usedNames.has(m.name) ? '（登録済み）' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
                <td>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={p.isAi} onChange={(e) => setPlayerIsAi(p.id, e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>実役職の割り振り</h2>
        <RoleBoard />
        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={unassignedCount === 0 || !earlyStagesDone} onClick={() => fillUnassignedAsVillager()}>
            未確認（{unassignedCount}人）を村人にする
          </button>
          {!earlyStagesDone && (
            <span className="hint">（人狼→予言者→霊媒師→狩人→狂人の確定が終わるまで使えません）</span>
          )}
          <button
            disabled={!validation.valid}
            onClick={() => {
              if (completeRegistration()) onRegistered?.()
            }}
          >
            登録を完了して1日目へ進む
          </button>
        </div>
        <p className="hint">「登録を完了して1日目へ進む」を押すと、未確認は自動的に村人として登録され、1日目に移行します。</p>
        {game.meta.day1WhiteNoticeMode === 'manual' ? (
          <label>
            初日白（{roleName('seer')}への通知対象・手動選択）
            <select
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
          </label>
        ) : (
          game.day1WhiteNotice && (
            <p>
              初日白（{roleName('seer')}への通知対象）: <b>{game.players.find((p) => p.id === game.day1WhiteNotice)?.displayName}</b>
              　※人狼以外の1人として、GMから{roleName('seer')}へ口頭で伝えてください。
            </p>
          )
        )}
        {!validation.valid && (
          <p className="hint error">
            人数が仕様と一致していません（未確認は村人扱いで計算）：
            {validation.issues.map((issue) => issue.replace(/^(\w+):/, (_m, r: string) => `${roleName(r as RoleKey)}:`)).join('　')}
          </p>
        )}
      </section>
    </div>
  )
}
