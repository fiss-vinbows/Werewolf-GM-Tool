import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { DEFAULT_ROLE_NAMES, type RoleKey } from '../domain/types'

// ゲーム進行とは直接関係のない設定項目（役職名・メモなど）をまとめる。
export function ConfigScreen() {
  const game = useGameStore((s) => s.game)
  const updateMeta = useGameStore((s) => s.updateMeta)
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
        <label className="row" style={{ alignItems: 'center' }}>
          <span>初日白（予言者への通知対象）の決め方</span>
          <span className="toggle-with-labels">
            自動抽選
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={game.meta.day1WhiteNoticeMode === 'manual'}
                onChange={(e) => updateMeta({ day1WhiteNoticeMode: e.target.checked ? 'manual' : 'auto' })}
              />
              <span className="toggle-slider" />
            </span>
            手動選択
          </span>
        </label>
        <p className="hint">
          自動抽選：人狼全員と予言者本人の登録が揃った時点で、システムが人狼・予言者以外から自動で1人抽選します。
          手動選択：GMが「実役職の割り振り」画面で対象を直接選びます（自動抽選は行いません）。
        </p>
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
