import { useEffect, useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import { PlayersScreen } from './components/PlayersScreen'
import { ConfigScreen } from './components/ConfigScreen'
import { DayScreen } from './components/DayScreen'
import { VoteScreen } from './components/VoteScreen'
import { NightScreen } from './components/NightScreen'
import { HistoryScreen } from './components/HistoryScreen'
import { SaveScreen } from './components/SaveScreen'
import { RosterScreen } from './components/RosterScreen'

type Tab = 'roster' | 'players' | 'config' | 'day' | 'vote' | 'night' | 'history' | 'save'

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: '参加者選出' },
  { key: 'players', label: 'プレイヤー登録' },
  { key: 'day', label: '昼・CO' },
  { key: 'vote', label: '投票' },
  { key: 'night', label: '夜' },
  { key: 'history', label: '訂正' },
  { key: 'save', label: '保存・終了' },
  { key: 'config', label: '設定' },
]

function App() {
  const [tab, setTab] = useState<Tab>('players')
  const game = useGameStore((s) => s.game)
  const setPhase = useGameStore((s) => s.setPhase)

  const aliveCount = game.players.filter((p) => p.alive).length

  // 議論中にうっかり投票タブへ移動しないよう、また昼の間は夜の操作をできないよう、
  // フェイズの進み具合に応じてタブ自体をロックする（誤操作防止）。
  const voteUnlocked = game.phase !== 'setup' && (game.phase !== 'day' || game.discussionEnded)
  const nightUnlocked = game.phase === 'night' || game.finished
  const tabLocked = (key: Tab): boolean => {
    if (key === 'vote') return !voteUnlocked
    if (key === 'night') return !nightUnlocked
    return false
  }

  function goToVote() {
    setPhase('vote')
    setTab('vote')
  }

  function goToNight() {
    setPhase('night')
    setTab('night')
  }

  // 勝敗が確定したら、自動的に保存・終了タブへ移行する。
  useEffect(() => {
    if (game.finished) setTab('save')
  }, [game.finished])

  return (
    <div className="app">
      <header className="app-header">
        <h1>人狼GM記録ツール</h1>
        <div className="status-bar">
          <span>{game.day}日目</span>
          <span>生存 {aliveCount}/{game.players.length}</span>
          <span>{game.finished ? `終了（${game.winner === 'village' ? '村勝利' : '人狼勝利'}）` : '進行中'}</span>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            disabled={tabLocked(t.key)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'roster' && <RosterScreen onApplied={() => setTab('players')} />}
        {tab === 'players' && <PlayersScreen onRegistered={() => setTab('day')} />}
        {tab === 'day' && <DayScreen onGoToVote={goToVote} />}
        {tab === 'vote' && <VoteScreen onGoToNight={goToNight} />}
        {tab === 'night' && <NightScreen onNextDay={() => setTab('day')} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'save' && <SaveScreen />}
        {tab === 'config' && <ConfigScreen />}
      </main>
    </div>
  )
}

export default App
