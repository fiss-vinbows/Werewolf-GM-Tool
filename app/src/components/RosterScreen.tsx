import { useState } from 'react'
import { useRosterStore } from '../store/rosterStore'
import { useGameStore } from '../store/gameStore'

// 参加者選出：13〜14人を超える参加者から、複数戦でまんべんなく参加できるように各試合の参加者を選ぶ。
export function RosterScreen({ onApplied }: { onApplied?: () => void }) {
  const r = useRosterStore()
  const game = useGameStore((s) => s.game)
  const applyParticipantNames = useGameStore((s) => s.applyParticipantNames)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // 削除の画面内二段階確認（PWA環境ではwindow.confirm()が機能しないことがあるため）
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingClear, setPendingClear] = useState(false)

  const aiCount = game.players.filter((p) => p.isAi).length
  const presentCount = r.members.filter((m) => m.present).length
  const games = [...r.games].sort((a, b) => a.index - b.index)
  const countFor = (id: string, status?: 'played' | 'planned') =>
    games.filter((g) => (!status || g.status === status) && g.participantIds.includes(id)).length
  const nameOf = (id: string) => r.members.find((m) => m.id === id)?.name ?? '（削除済み）'

  function apply(gameId: string) {
    const g = games.find((x) => x.id === gameId)!
    const ok = applyParticipantNames(g.participantIds.map(nameOf))
    if (ok) {
      setMessage(`${g.index}戦目の参加者をプレイヤー登録に反映しました。`)
      onApplied?.()
    } else {
      setMessage(
        game.phase !== 'setup'
          ? 'ゲーム進行中は反映できません。「保存・終了」タブで新規ゲームを始めてから反映してください。'
          : `人数が合いません（参加者${g.participantIds.length}人＋AI${aiCount}人は13人か14人である必要があります）。`,
      )
    }
  }

  return (
    <div className="screen">
      <section className="card">
        <h2>参加者名簿（{r.members.length}人・出席{presentCount}人）</h2>
        <p>
          現在の参加者数：<strong>出席{presentCount}人</strong>（名簿{r.members.length}人・欠席{r.members.length - presentCount}人）
        </p>
        <p className="hint">名前を改行またはカンマ区切りで入力して追加します。欠席・途中退出の人は「出席」を外してください。名簿はゲーム記録とは別に保存され、新規ゲームでも消えません。</p>
        <div className="row">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ flex: 1, minWidth: 200 }} placeholder={'山田\n佐藤\n鈴木'} />
          <button
            onClick={() => {
              r.addMembers(text)
              setText('')
            }}
            disabled={!text.trim()}
          >
            追加
          </button>
        </div>
        {r.members.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>出席</th>
                <th>名前</th>
                <th>参加済み</th>
                <th>予定含む合計</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {r.members.map((m) => (
                <tr key={m.id} style={{ opacity: m.present ? 1 : 0.5 }}>
                  <td>
                    <input type="checkbox" checked={m.present} onChange={() => r.togglePresent(m.id)} />
                  </td>
                  <td>
                    <input value={m.name} onChange={(e) => r.renameMember(m.id, e.target.value)} />
                  </td>
                  <td>{countFor(m.id, 'played')}</td>
                  <td>{countFor(m.id)}</td>
                  <td>
                    {pendingDelete === m.id ? (
                      <div className="row">
                        <button
                          onClick={() => {
                            r.removeMember(m.id)
                            setPendingDelete(null)
                          }}
                        >
                          本当に削除
                        </button>
                        <button onClick={() => setPendingDelete(null)}>やめる</button>
                      </div>
                    ) : (
                      <button onClick={() => setPendingDelete(m.id)}>削除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>組み合わせの作成</h2>
        <div className="row">
          <label>
            試合数
            <input type="number" min={1} max={20} value={r.plannedGames} onChange={(e) => r.setPlannedGames(Number(e.target.value))} style={{ width: 70 }} />
          </label>
          <label>
            1戦の人間の参加人数
            <input type="number" min={1} max={14} value={r.seats} onChange={(e) => r.setSeats(Number(e.target.value))} style={{ width: 70 }} />
          </label>
          <span className="hint">現在のAI席: {aiCount}人（人間＋AIで13人か14人）</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button disabled={presentCount === 0} onClick={() => r.generateSchedule()}>
            残りの試合の組み合わせを作成
          </button>
          <span className="hint">終了済みの試合はそのまま残し、未実施の試合だけを出席者から作り直します（参加回数の少ない人・直前に休んだ人を優先）。</span>
        </div>
        {message && <p>{message}</p>}
      </section>

      {games.length > 0 && (
        <section className="card roster-schedule">
          <h2>試合ごとの参加者</h2>
          <p className="hint">未実施の試合は、セルをクリックして参加者を手動で入れ替えられます。</p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>名前</th>
                  {games.map((g) => (
                    <th key={g.id}>
                      {g.index}戦目
                      <div className="hint">
                        {g.participantIds.length}人{g.status === 'played' ? '・終了' : ''}
                      </div>
                    </th>
                  ))}
                  <th>回数</th>
                </tr>
              </thead>
              <tbody>
                {r.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    {games.map((g) => {
                      const on = g.participantIds.includes(m.id)
                      return (
                        <td
                          key={g.id}
                          className={`roster-cell${on ? ' on' : ''}${g.status === 'played' ? ' played' : ''}`}
                          onClick={() => r.toggleParticipant(g.id, m.id)}
                        >
                          {on ? '●' : ''}
                        </td>
                      )
                    })}
                    <td>{countFor(m.id)}</td>
                  </tr>
                ))}
                <tr>
                  <td></td>
                  {games.map((g) => (
                    <td key={g.id}>
                      {g.status === 'planned' ? (
                        <div className="roster-actions">
                          <button onClick={() => apply(g.id)}>登録へ反映</button>
                          <button onClick={() => r.setGameStatus(g.id, 'played')}>終了済みにする</button>
                        </div>
                      ) : (
                        <button onClick={() => r.setGameStatus(g.id, 'planned')}>未実施に戻す</button>
                      )}
                    </td>
                  ))}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.members.length > 0 && (
        <section className="card">
          {pendingClear ? (
            <div className="row">
              <span>名簿と組み合わせをすべて削除しますか？</span>
              <button
                onClick={() => {
                  r.clearAll()
                  setPendingClear(false)
                }}
              >
                すべて削除する
              </button>
              <button onClick={() => setPendingClear(false)}>やめる</button>
            </div>
          ) : (
            <button onClick={() => setPendingClear(true)}>名簿と組み合わせをすべて削除</button>
          )}
        </section>
      )}
    </div>
  )
}
