import type { GameState } from './types'
import { formatWolfResult } from './resultLabel'

export function exportGameJson(game: GameState): string {
  return JSON.stringify(game, null, 2)
}

const TRUE_CAUSE_LABELS: Record<string, string> = {
  execution: '処刑',
  'wolf-attack': '襲撃死',
  other: 'その他',
}

const CO_STATUS_LABELS: Record<string, string> = {
  active: '有効',
  retracted: '撤回済み',
  changed: '変更済み',
}

// 人が読めるテキスト書き出し(4-7)。
export function exportGameText(game: GameState): string {
  const roleName = (role: string | null) => (role ? game.meta.roleNames[role as keyof typeof game.meta.roleNames] ?? role : '未確認')
  // 人狼判定の結果表記は設定タブの「人狼／人間の表示方法」に倣う（英語のまま出さない）。
  const resultText = (result: 'wolf' | 'not-wolf' | 'guarded') =>
    result === 'guarded' ? '護衛成功' : formatWolfResult(result, game.meta.resultLabelStyle)
  const lines: string[] = []
  lines.push(`人狼GM記録　ゲームID: ${game.meta.gameId}`)
  lines.push(`作成: ${game.meta.createdAt} / 更新: ${game.meta.updatedAt}`)
  lines.push(`メモ: ${game.meta.memo || '(なし)'}`)
  lines.push('')
  lines.push('■ 参加者と実役職')
  for (const p of game.players) {
    const deathInfo = p.death ? `　死亡: ${p.death.day}日目 (${TRUE_CAUSE_LABELS[p.death.trueCause] ?? p.death.trueCause})` : ''
    lines.push(`  ${p.displayName}${p.isAi ? '[AI]' : ''}　実役職: ${roleName(p.actualRole)}${deathInfo}`)
  }
  lines.push('')
  lines.push('■ CO履歴')
  for (const co of game.coRecords) {
    const player = game.players.find((p) => p.id === co.playerId)
    lines.push(`  [${co.day}日目] ${player?.displayName ?? co.playerId} が ${roleName(co.claimedRole)} をCO (${CO_STATUS_LABELS[co.status] ?? co.status})`)
  }
  lines.push('')
  lines.push('■ 公表結果')
  for (const claim of game.resultClaims) {
    const speaker = game.players.find((p) => p.id === claim.speakerId)
    const target = game.players.find((p) => p.id === claim.targetId)
    lines.push(
      `  [${claim.announcedDay}日目公表/対象${claim.targetDay}日目] ${speaker?.displayName ?? claim.speakerId} → ${target?.displayName ?? claim.targetId}: ${resultText(claim.result)}${claim.retracted ? '(訂正済み)' : ''}`,
    )
  }
  lines.push('')
  lines.push('■ 投票')
  const voteKindLabel = (kind: string) => ({ normal: '通常投票', runoff1: '決選投票1', runoff2: '決選投票2' }[kind] ?? kind)
  for (const round of game.voteRounds) {
    lines.push(`  [${round.day}日目 ${voteKindLabel(round.kind)}] 票:`)
    for (const v of round.votes) {
      const voter = game.players.find((p) => p.id === v.voterId)
      const target = game.players.find((p) => p.id === v.targetId)
      lines.push(`    ${voter?.displayName ?? v.voterId} → ${target?.displayName ?? v.targetId}`)
    }
    if (round.resolved) {
      const executed = game.players.find((p) => p.id === round.executedId)
      lines.push(`    結果: ${executed ? executed.displayName + ' 処刑' : '処刑者なし'}`)
    }
  }
  lines.push('')
  lines.push('■ 夜の記録')
  for (const n of game.nightRecords) {
    lines.push(`  [${n.day}日目夜]`)
    if (n.seer) {
      const t = game.players.find((p) => p.id === n.seer!.targetId)
      lines.push(`    予言: ${t?.displayName} → ${resultText(n.seer.result)}`)
    }
    if (n.medium) {
      const t = game.players.find((p) => p.id === n.medium!.targetId)
      lines.push(`    霊媒: ${t?.displayName} → ${resultText(n.medium.result)}`)
    }
    if (n.bodyguard) {
      const t = game.players.find((p) => p.id === n.bodyguard!.targetId)
      lines.push(`    護衛: ${t?.displayName} (${n.bodyguard.success ? '成功' : '失敗/対象外'})`)
    }
    if (n.wolf) {
      const t = game.players.find((p) => p.id === n.wolf!.targetId)
      lines.push(`    襲撃: ${t?.displayName} (${n.wolf.success ? '成功(死亡)' : '失敗(護衛成功)'})`)
    }
  }
  lines.push('')
  lines.push(`■ 勝敗: ${game.finished ? (game.winner === 'village' ? '村人陣営勝利' : game.winner === 'wolf' ? '人狼陣営勝利' : '未確定') : '進行中'}`)
  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
