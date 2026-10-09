import type { Player } from '../domain/types'

// プレイヤー名の右側にAIタグ・死亡情報（何日目に処刑／襲撃されたか）を付けて表示する共通コンポーネント。
// 死亡情報は名前が折り返さないよう「処2」「襲3」のように短く表示し、正式な表記は title（長押し・マウスを乗せる）で示す。
export function PlayerName({ player }: { player: Player }) {
  const cause = player.death ? (player.death.publicCause ?? (player.death.trueCause === 'execution' ? '処刑' : '死亡')) : ''
  return (
    <>
      {player.displayName}
      {player.isAi && <span className="chip-ai">AI</span>}
      {!player.alive && player.death && (
        <span className="chip-dead" title={`${player.death.day}日目${cause}`}>
          {cause.slice(0, 1)}
          {player.death.day}
        </span>
      )}
    </>
  )
}
