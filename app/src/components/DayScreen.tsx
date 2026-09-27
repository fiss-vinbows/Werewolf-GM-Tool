import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_ROLE_NAMES, type CoStatus, type ResultClaimKind, type RoleKey } from '../domain/types'
import { elapsedMs } from '../domain/gameClock'
import { formatWolfResult } from '../domain/resultLabel'
import { CoBoard } from './CoBoard'

const CO_STATUS_LABELS: Record<CoStatus, string> = {
  active: 'CO中',
  retracted: '撤回',
  changed: '変更',
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ゲーム開始からの経過時間（実時刻ではなく進行の経過時間）を m:ss / h:mm:ss 形式で表示する。
// 議論タイマーを一時停止していた時間は差し引く（止めている間は進めない）。
function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function DayScreen({ onGoToVote }: { onGoToVote?: () => void }) {
  const game = useGameStore((s) => s.game)
  const retractCoRecord = useGameStore((s) => s.retractCoRecord)
  const retractResultClaim = useGameStore((s) => s.retractResultClaim)
  const startDayTimer = useGameStore((s) => s.startDayTimer)
  const pauseDayTimer = useGameStore((s) => s.pauseDayTimer)
  const resetDayTimer = useGameStore((s) => s.resetDayTimer)
  const setDayTimerMinutes = useGameStore((s) => s.setDayTimerMinutes)
  const endDiscussion = useGameStore((s) => s.endDiscussion)
  const updateMeta = useGameStore((s) => s.updateMeta)

  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? DEFAULT_ROLE_NAMES[r]
  const formatTime = (iso: string) => formatElapsedMs(elapsedMs(game.meta.createdAt, iso, game.pauseIntervals))
  const kindLabel = (kind: ResultClaimKind) => roleName(kind === 'guard' ? 'bodyguard' : kind)

  // タイマー表示を1秒ごとに更新するためだけの再描画トリガー。
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!game.dayTimer.running) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [game.dayTimer.running])

  const remainingMs = Math.max(
    0,
    game.dayTimer.remainingMs - (game.dayTimer.running && game.dayTimer.startedAt ? Date.now() - new Date(game.dayTimer.startedAt).getTime() : 0),
  )
  const [minutesInput, setMinutesInput] = useState<string>(String(Math.round(game.dayTimer.durationMs / 60000)))

  // タイマーが0になったら、うっかり投票へ進めないよう議論終了フラグを自動で立てる。
  useEffect(() => {
    if (remainingMs === 0 && !game.discussionEnded) endDiscussion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, game.discussionEnded])

  return (
    <div className="screen">
      <section className="card">
        <h2>日数・進行</h2>
        {game.day === 1 && game.day1WhiteNotice && (
          <p>
            初日白（{roleName('seer')}への通知対象）:{' '}
            <b>{game.players.find((p) => p.id === game.day1WhiteNotice)?.displayName}</b>
          </p>
        )}
        <div className="row">
          <span>現在: {game.day}日目</span>
          {game.discussionEnded ? (
            <button onClick={() => onGoToVote?.()}>投票に移る →</button>
          ) : (
            <span className="hint">（議論タイマーが0になるか、「議論を切り上げる」を押すと投票に移れます）</span>
          )}
        </div>
        <div className="row">
          <span className={`timer-display${remainingMs === 0 ? ' timer-zero' : ''}`}>{formatCountdown(remainingMs)}</span>
          {game.dayTimer.running ? (
            <button onClick={() => pauseDayTimer()}>一時停止</button>
          ) : (
            <button onClick={() => startDayTimer()} disabled={remainingMs === 0}>
              {remainingMs < game.dayTimer.durationMs ? '再開' : '議論タイマー開始'}
            </button>
          )}
          <button onClick={() => resetDayTimer()}>リセット</button>
          <label>
            残り時間設定（分）
            <input
              type="number"
              min={0}
              style={{ width: 60 }}
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              onBlur={() => setDayTimerMinutes(Number(minutesInput) || 0)}
            />
          </label>
          {!game.discussionEnded && <button onClick={() => endDiscussion()}>議論を切り上げる</button>}
        </div>
      </section>

      <section className="card">
        <h2>役職CO</h2>
        <CoBoard />
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>日</th>
              <th>時刻</th>
              <th>投票番目</th>
              <th>プレイヤー</th>
              <th>主張役職</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {game.coRecords
              .slice()
              .sort((a, b) => b.eventOrder - a.eventOrder)
              .map((c) => {
                const p = game.players.find((pl) => pl.id === c.playerId)
                return (
                  <tr key={c.id}>
                    <td>{c.day}日目</td>
                    <td>{formatTime(c.recordedAt)}</td>
                    <td>{c.afterVoteCount != null ? `${c.afterVoteCount}票目の後` : '－'}</td>
                    <td>{p?.displayName}</td>
                    <td>
                      {roleName(c.claimedRole)}（{CO_STATUS_LABELS[c.status]}）
                    </td>
                    <td>{c.status === 'active' && p?.alive && <button onClick={() => retractCoRecord(c.id)}>撤回</button>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card">
        <h2>{roleName('seer')}CO一覧（{roleName('seer')}をCOした人だけをまとめた記録）</h2>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>日</th>
              <th>時刻</th>
              <th>投票番目</th>
              <th>プレイヤー</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {game.coRecords
              .filter((c) => c.claimedRole === 'seer')
              .slice()
              .sort((a, b) => b.eventOrder - a.eventOrder)
              .map((c) => {
                const p = game.players.find((pl) => pl.id === c.playerId)
                return (
                  <tr key={c.id}>
                    <td>{c.day}日目</td>
                    <td>{formatTime(c.recordedAt)}</td>
                    <td>{c.afterVoteCount != null ? `${c.afterVoteCount}票目の後` : '－'}</td>
                    <td>{p?.displayName}</td>
                    <td>{CO_STATUS_LABELS[c.status]}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
        {game.coRecords.filter((c) => c.claimedRole === 'seer').length === 0 && <p className="hint">まだ{roleName('seer')}のCOはありません。</p>}
      </section>

      <section className="card">
        <h2>備考</h2>
        <textarea
          value={game.meta.memo}
          onChange={(e) => updateMeta({ memo: e.target.value })}
          placeholder="自由に記入してください"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </section>

      <section className="card">
        <h2>公表結果の履歴（予言・霊媒・護衛の結果開示はCOボードのドラッグで記録）</h2>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>時刻</th>
              <th>公表日</th>
              <th>対象日</th>
              <th>内容</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {game.resultClaims
              .slice()
              .sort((a, b) => b.eventOrder - a.eventOrder)
              .map((c) => {
                const speaker = game.players.find((p) => p.id === c.speakerId)
                const target = game.players.find((p) => p.id === c.targetId)
                const resultText = c.result === 'guarded' ? '護衛成功' : formatWolfResult(c.result, game.meta.resultLabelStyle)
                const content = `${kindLabel(c.kind)}：${speaker?.displayName}→${target?.displayName}：${resultText}`
                return (
                  <tr key={c.id}>
                    <td>{formatTime(c.recordedAt)}</td>
                    <td>{c.announcedDay}日目</td>
                    <td>{c.targetDay}番目</td>
                    <td>{c.retracted ? `(訂正済) ${content}` : content}</td>
                    <td>{!c.retracted && speaker?.alive && <button onClick={() => retractResultClaim(c.id)}>訂正</button>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}
