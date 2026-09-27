import { useGameStore } from '../store/gameStore'

export function HistoryScreen() {
  const game = useGameStore((s) => s.game)
  const undo = useGameStore((s) => s.undo)

  return (
    <div className="screen">
      <section className="card">
        <h2>誤記訂正（1つ戻る）</h2>
        <p className="hint">
          公表済みのAI票・実際に発表した内容は、この操作では変更しません。誤入力の訂正のみを想定しています。
        </p>
        <button disabled={game.history.length === 0} onClick={() => undo()}>
          直前の操作を1つ戻す（残り{game.history.length}件）
        </button>
        <ul>
          {game.history
            .slice()
            .reverse()
            .slice(0, 10)
            .map((h, i) => (
              <li key={i}>
                {h.timestamp}: {h.label}
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
