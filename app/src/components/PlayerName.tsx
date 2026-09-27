import type { Player } from '../domain/types'

// プレイヤー名の右側にAIタグ・死亡情報（何日目に処刑／襲撃されたか）を付けて表示する共通コンポーネント。
export function PlayerName({ player }: { player: Player }) {
  return (
    <>
      {player.displayName}
      {player.isAi && <span className="chip-ai">AI</span>}
      {!player.alive && player.death && (
        <span className="chip-dead">
          {player.death.day}日目{player.death.publicCause ?? (player.death.trueCause === 'execution' ? '処刑' : '死亡')}
        </span>
      )}
    </>
  )
}
