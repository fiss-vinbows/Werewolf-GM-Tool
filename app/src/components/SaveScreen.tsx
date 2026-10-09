import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { downloadTextFile, exportGameJson, exportGameText } from '../domain/export'
import { exportResultCsv } from '../domain/exportCsv'
import { RoleRoster } from './RoleRoster'

export function SaveScreen() {
  const game = useGameStore((s) => s.game)
  const finishGame = useGameStore((s) => s.finishGame)
  const resetGame = useGameStore((s) => s.resetGame)
  // window.confirm はインストール済みPWAの環境で動かないことがあるため、
  // 画面内の二段階確認（もう一度押すと実行）に置き換える。
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <div className="screen">
      <section className="card">
        <h2>実役職一覧</h2>
        <RoleRoster />
      </section>

      <section className="card">
        <h2>勝敗判定・終了</h2>
        <p className="hint">
          人狼全滅なら村人陣営勝利。生存人狼と、それ以外の生存者の人数が同数になれば人狼陣営勝利です（狂人は人狼以外に含める）。
        </p>
        <div className="row">
          <button disabled={game.finished} onClick={() => finishGame('village')}>
            村人陣営の勝利で終了
          </button>
          <button disabled={game.finished} onClick={() => finishGame('wolf')}>
            人狼陣営の勝利で終了
          </button>
        </div>
        {game.finished && <p>この対戦は終了しました（{game.winner === 'village' ? '村人陣営勝利' : '人狼陣営勝利'}）。</p>}
      </section>

      <section className="card">
        <h2>記録の保存・書き出し</h2>
        <div className="row">
          <button onClick={() => downloadTextFile(`${game.meta.gameId}.json`, exportGameJson(game))}>
            分析・再現用JSONを書き出す
          </button>
          <button onClick={() => downloadTextFile(`${game.meta.gameId}.txt`, exportGameText(game))}>
            人が読めるテキストを書き出す
          </button>
          <button onClick={() => downloadTextFile(`${game.meta.gameId}.csv`, exportResultCsv(game), 'text/csv;charset=utf-8')}>
            スプレッドシート用CSVを書き出す
          </button>
        </div>
        <p className="hint">CSVはGoogleスプレッドシートの「ファイル → インポート」で取り込めます。</p>
      </section>

      <section className="card">
        <h2>新しい対戦を開始</h2>
        <p className="hint">過去の戦績は上書きされません。書き出しがまだの場合は、先に保存してください。</p>
        {!confirmingReset ? (
          <button onClick={() => setConfirmingReset(true)}>新規ゲーム開始</button>
        ) : (
          <div className="row">
            <span className="hint error">本当に開始しますか？（書き出していない記録は失われます）</span>
            <button
              onClick={() => {
                resetGame()
                setConfirmingReset(false)
              }}
            >
              はい、新規ゲームを開始する
            </button>
            <button onClick={() => setConfirmingReset(false)}>キャンセル</button>
          </div>
        )}
      </section>
    </div>
  )
}
