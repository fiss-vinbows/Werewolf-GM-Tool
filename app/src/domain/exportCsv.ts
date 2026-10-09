// スプレッドシート用のCSV書き出し（ユーザー提供の様式 input/無題のスプレッドシート - シート1.csv に合わせる）。
// 左側（A〜C列）：プレイヤー・実際の役職・補足（AI、騙り予言者1 など）。
// 右側（D列〜）：日ごとの出来事。列はその出来事が起きた「夜の日付」（初日＝1日目）にそろえる。
//   処刑：その日の処刑者／襲撃：その夜の襲撃先（護衛されたら「（失敗）」）
//   予言者・霊媒師・狩人：本物の役職者のその夜の結果（狩人は護衛先、成功なら「（護衛）」）
//   騙り○○N：偽物の公表結果を公表した順に（死亡した次の日は「－」）
import type { GameState, PlayerId, RoleKey } from './types'

const JUDGE_ROLES: RoleKey[] = ['seer', 'medium', 'bodyguard']
const MIN_DAYS = 8

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function exportResultCsv(game: GameState): string {
  const roleName = (r: RoleKey) => game.meta.roleNames[r] ?? r
  const nameOf = (id: PlayerId | null | undefined) => (id ? (game.players.find((p) => p.id === id)?.displayName ?? id) : '')
  const bw = (r: string) => (r === 'wolf' ? '黒' : '白')
  const players = [...game.players].sort((a, b) => a.registrationOrder - b.registrationOrder)

  // 偽物（実際の役職と違う役職をCOした人）に、役職ごとにCO順の番号を付ける。
  const fakeLabel = new Map<PlayerId, string[]>()
  const fakeRows: { label: string; playerId: PlayerId; role: RoleKey }[] = []
  for (const role of JUDGE_ROLES) {
    const fakers: PlayerId[] = []
    for (const c of [...game.coRecords].sort((a, b) => a.eventOrder - b.eventOrder)) {
      if (c.claimedRole !== role || fakers.includes(c.playerId)) continue
      if (game.players.find((p) => p.id === c.playerId)?.actualRole === role) continue
      fakers.push(c.playerId)
    }
    fakers.forEach((id, i) => {
      const label = `騙り${roleName(role)}${fakers.length > 1 ? i + 1 : ''}`
      fakeLabel.set(id, [...(fakeLabel.get(id) ?? []), label])
      fakeRows.push({ label, playerId: id, role })
    })
  }

  const days = Math.max(MIN_DAYS, game.day)
  const dayHeaders = Array.from({ length: days }, (_, i) => (i === 0 ? '初日' : `${i + 1}日目`))
  const night = (d: number) => game.nightRecords.find((n) => n.day === d)
  // 死亡した次の日（対戦が続いていた日）だけ「－」を入れる（様式の例に合わせる）。
  const justDied = (id: PlayerId, d: number) => {
    const p = game.players.find((x) => x.id === id)
    return !!p?.death && p.death.day === d - 1 && d <= game.day
  }

  // 右側の各行（日ごとの値）。
  const eventRows: [string, string[]][] = []
  eventRows.push([
    '処刑',
    dayHeaders.map((_, i) => nameOf(game.voteRounds.filter((r) => r.day === i + 1 && r.resolved && r.executedId).at(-1)?.executedId)),
  ])
  eventRows.push([
    '襲撃',
    dayHeaders.map((_, i) => {
      const w = night(i + 1)?.wolf
      return w ? `${nameOf(w.targetId)}${w.success ? '' : '（失敗）'}` : ''
    }),
  ])
  const trueRow = (role: RoleKey): [string, string[]] => [
    roleName(role),
    dayHeaders.map((_, i) => {
      const n = night(i + 1)
      if (role === 'seer') return n?.seer ? `${nameOf(n.seer.targetId)}→${bw(n.seer.result)}` : ''
      if (role === 'medium') return n?.medium ? `${nameOf(n.medium.targetId)}→${bw(n.medium.result)}` : ''
      return n?.bodyguard ? `${nameOf(n.bodyguard.targetId)}${n.bodyguard.success ? '（護衛）' : ''}` : ''
    }),
  ]
  for (const role of JUDGE_ROLES) {
    eventRows.push(trueRow(role))
    for (const f of fakeRows.filter((x) => x.role === role)) {
      const kind = role === 'bodyguard' ? 'guard' : role
      const claims = game.resultClaims
        .filter((c) => c.speakerId === f.playerId && c.kind === kind && !c.retracted)
        .sort((a, b) => a.eventOrder - b.eventOrder)
      eventRows.push([
        f.label,
        dayHeaders.map((_, i) => {
          const c = claims[i]
          if (c) {
            if (c.result === 'guarded') return nameOf(c.targetId)
            if (c.result === 'guard-success') return `${nameOf(c.targetId)}（護衛）`
            return `${nameOf(c.targetId)}→${bw(c.result)}`
          }
          return justDied(f.playerId, i + 1) ? '－' : ''
        }),
      ])
    }
  }

  const rows: string[][] = [['プレイヤー', '役職', '', '', ...dayHeaders]]
  const n = Math.max(players.length, eventRows.length)
  for (let i = 0; i < n; i++) {
    const p = players[i]
    const notes = p ? [...(p.isAi ? ['AI'] : []), ...(fakeLabel.get(p.id) ?? [])].join('・') : ''
    const left = p ? [p.displayName, p.actualRole ? roleName(p.actualRole) : '', notes] : ['', '', '']
    const ev = eventRows[i]
    rows.push([...left, ev ? ev[0] : '', ...(ev ? ev[1] : dayHeaders.map(() => ''))])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
