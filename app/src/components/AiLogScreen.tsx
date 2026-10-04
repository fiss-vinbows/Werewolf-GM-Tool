import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { AiNightActionKind, PlayerId, VoteRoundKind } from '../domain/types'

// AIの判断履歴の振り返り（仕様5-2：入力・選択・理由・判断方式の版を保存して振り返れるようにする）。
// 判断理由は非公開情報を含み得るため、GM専用の画面として扱う。

type LogEntry = {
  id: string
  day: number
  decidedAt: string
  aiId: PlayerId
  kindLabel: string
  targetId: PlayerId
  statusLabel: string | null
  superseded: boolean
  detail: string | null
  policyVersion: string
  reasons: string[]
}

const VOTE_KIND_LABEL: Record<VoteRoundKind, string> = {
  normal: '通常投票',
  runoff1: '決選投票1回目',
  runoff2: '決選投票2回目',
}
const NIGHT_KIND_LABEL: Record<AiNightActionKind, string> = {
  seer: '予言',
  guard: '護衛',
  wolf: '襲撃',
}
const GUARD_MODE_LABEL: Record<string, string> = {
  seer: '予言者を護衛',
  medium: '霊媒師を護衛',
  other: 'その他',
  solid: '堅実（役職者→確定白→低得票者）',
  throwaway: '捨て護衛',
}

export function AiLogScreen() {
  const game = useGameStore((s) => s.game)
  const [aiFilter, setAiFilter] = useState<PlayerId | 'all'>('all')
  const [showSuperseded, setShowSuperseded] = useState(false)
  const [copied, setCopied] = useState(false)

  const nameOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.displayName ?? id
  const aiPlayers = game.players.filter((p) => p.isAi)

  const entries: LogEntry[] = []
  for (const r of game.voteRounds) {
    for (const d of r.aiDecisions ?? []) {
      entries.push({
        id: d.id,
        day: r.day,
        decidedAt: d.decidedAt,
        aiId: d.aiId,
        kindLabel: VOTE_KIND_LABEL[r.kind],
        targetId: d.targetId,
        statusLabel: d.status === 'announced' ? '発表済み' : d.status === 'superseded' ? '再判断で置き換え' : '表示のみ（未発表）',
        superseded: d.status === 'superseded',
        detail: `判断時点で見えていた票：${d.visibleVoteCount}票`,
        policyVersion: d.policyVersion,
        reasons: d.reasons,
      })
    }
  }
  for (const d of game.aiNightDecisions ?? []) {
    entries.push({
      id: d.id,
      day: d.day,
      decidedAt: d.decidedAt,
      aiId: d.aiId,
      kindLabel: `夜・${NIGHT_KIND_LABEL[d.kind]}`,
      targetId: d.targetId,
      statusLabel: null,
      superseded: false,
      detail: d.guardMode ? `護衛方針：${GUARD_MODE_LABEL[d.guardMode] ?? d.guardMode}` : null,
      policyVersion: d.policyVersion,
      reasons: d.reasons,
    })
  }
  const visible = entries
    .filter((e) => aiFilter === 'all' || e.aiId === aiFilter)
    .filter((e) => showSuperseded || !e.superseded)
    .sort((a, b) => a.day - b.day || a.decidedAt.localeCompare(b.decidedAt))
  const days = [...new Set(visible.map((e) => e.day))]
  const hiddenSuperseded = entries.filter((e) => e.superseded).length

  function toText(): string {
    const lines = [`AI判断履歴（${game.meta.gameId}）`]
    for (const day of days) {
      lines.push('', `■ ${day}日目`)
      for (const e of visible.filter((x) => x.day === day)) {
        lines.push(
          `・${e.kindLabel}　${nameOf(e.aiId)} → ${nameOf(e.targetId)}${e.statusLabel ? `（${e.statusLabel}）` : ''}　[${e.policyVersion}]`,
        )
        if (e.detail) lines.push(`　${e.detail}`)
        for (const r of e.reasons) lines.push(`　- ${r}`)
      }
    }
    return lines.join('\n')
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(toText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="screen">
      <section className="card">
        <h2>AI判断履歴</h2>
        <p className="hint">
          AIの投票・夜行動の判断と、その理由を振り返る画面です。理由には非公開情報が含まれるため、プレイヤーには見せないでください。
        </p>
        {aiPlayers.length === 0 && entries.length === 0 ? (
          <p>AIプレイヤーが登録されていません。「プレイヤー登録」でAIを設定してください。</p>
        ) : (
          <div className="row">
            {aiPlayers.length > 1 && (
              <label>
                AI
                <select value={aiFilter} onChange={(e) => setAiFilter(e.target.value as PlayerId | 'all')} style={{ width: 160 }}>
                  <option value="all">すべて</option>
                  {aiPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
              再判断で置き換えた判断も表示（{hiddenSuperseded}件）
            </label>
            <button disabled={visible.length === 0} onClick={copyText}>
              {copied ? 'コピーしました' : 'テキストでコピー'}
            </button>
          </div>
        )}
      </section>

      {visible.length === 0 && entries.length > 0 && <p className="hint">表示する判断がありません。</p>}
      {aiPlayers.length > 0 && entries.length === 0 && (
        <section className="card">
          <p className="hint">まだAIの判断はありません。投票・夜の画面でAIが判断すると、ここに記録されます。</p>
        </section>
      )}

      {days.map((day) => (
        <section className="card" key={day}>
          <h2>{day}日目</h2>
          <ul className="ai-log-list">
            {visible
              .filter((e) => e.day === day)
              .map((e) => (
                <li key={e.id} className={e.superseded ? 'ai-log-superseded' : ''}>
                  <div>
                    <strong>{e.kindLabel}</strong>　{nameOf(e.aiId)} → <strong>{nameOf(e.targetId)}</strong>
                    {e.statusLabel && <span className="hint">（{e.statusLabel}）</span>}
                  </div>
                  <div className="hint">
                    {e.detail && <>{e.detail}　</>}判断方式：{e.policyVersion}
                  </div>
                  <details>
                    <summary>判断理由（{e.reasons.length}件）</summary>
                    <ul className="ai-reasons">
                      {e.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
