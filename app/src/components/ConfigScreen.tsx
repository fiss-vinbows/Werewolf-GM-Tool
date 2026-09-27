import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_ROLE_NAMES, type RoleKey } from '../domain/types'

// ゲーム進行とは直接関係のない設定項目（座席モード・役職名・メモ）をまとめる。
export function ConfigScreen() {
  const game = useGameStore((s) => s.game)
  const updateMeta = useGameStore((s) => s.updateMeta)
  const setSeatMode = useGameStore((s) => s.setSeatMode)
  const setRoleName = useGameStore((s) => s.setRoleName)
  const resetKeepingNames = useGameStore((s) => s.resetKeepingNames)
  const setDayTimerMinutes = useGameStore((s) => s.setDayTimerMinutes)
  // window.confirm はインストール済みPWAの環境で動かないことがあるため、
  // 画面内の二段階確認（もう一度押すと実行）に置き換える。
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <div className="screen">
      <section className="card">
        <h2>ゲーム設定</h2>
        <label>
          ルールメモ
          <input value={game.meta.ruleNote} onChange={(e) => updateMeta({ ruleNote: e.target.value })} />
        </label>
        <label>
          自由メモ
          <textarea value={game.meta.memo} onChange={(e) => updateMeta({ memo: e.target.value })} />
        </label>
        <label>
          座席モード
          <select value={game.meta.seatMode} onChange={(e) => setSeatMode(e.target.value as 'fixed' | 'flexible')}>
            <option value="fixed">固定（席替えなし）</option>
            <option value="flexible">非固定（席替えあり・座席は記録しない）</option>
          </select>
        </label>
        <label>
          通常投票のAI中央投票順（初期値）
          <input
            type="number"
            min={1}
            value={game.meta.defaultAiOrder ?? ''}
            onChange={(e) => updateMeta({ defaultAiOrder: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <p className="hint">投票ラウンド開始時にAI中央投票順の初期値として入力済みの状態にします。ラウンドごとに変更も可能です。</p>
        <label>
          昼フェイズの議論タイマー（カウントダウン・分）
          <input
            type="number"
            min={0}
            defaultValue={Math.round(game.dayTimer.durationMs / 60000)}
            onBlur={(e) => setDayTimerMinutes(Number(e.target.value) || 0)}
          />
        </label>
        <p className="hint">昼フェイズ画面でも同じ設定を変更できます。</p>
        <label className="row" style={{ alignItems: 'center' }}>
          <span>人狼／人間の表示方法（人狼・人間 ⇔ 黒・白）</span>
          <span className="toggle-with-labels">
            人狼・人間
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={game.meta.resultLabelStyle === 'black-white'}
                onChange={(e) => updateMeta({ resultLabelStyle: e.target.checked ? 'black-white' : 'wolf-human' })}
              />
              <span className="toggle-slider" />
            </span>
            黒・白
          </span>
        </label>
      </section>

      <section className="card">
        <h2>役職名の設定（同義語をこのツール内で統一表示）</h2>
        <div className="role-name-row">
          {(Object.keys(DEFAULT_ROLE_NAMES) as RoleKey[]).map((role) => (
            <label key={role}>
              {DEFAULT_ROLE_NAMES[role]}の表示名
              <input value={game.meta.roleNames[role]} onChange={(e) => setRoleName(role, e.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>登録のリセット</h2>
        <p className="hint">表示名（参加者の名前）だけを残し、役職・AI設定・進行状況などそれ以外の記録をすべて初期化します。</p>
        {!confirmingReset ? (
          <button onClick={() => setConfirmingReset(true)}>参加者の名前以外をリセット</button>
        ) : (
          <div className="row">
            <span className="hint error">本当にリセットしますか？（役職・進行中の記録は失われます）</span>
            <button
              onClick={() => {
                resetKeepingNames()
                setConfirmingReset(false)
              }}
            >
              はい、リセットする
            </button>
            <button onClick={() => setConfirmingReset(false)}>キャンセル</button>
          </div>
        )}
      </section>
    </div>
  )
}
