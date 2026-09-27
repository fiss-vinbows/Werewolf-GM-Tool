import { roleCountsFor, type Player, type RoleKey } from './types'

export type RoleValidation = {
  valid: boolean
  projectedCounts: Record<RoleKey, number>
  issues: string[]
}

// 未確認は村人になる前提で、確定時の役職人数が仕様どおりかを判定する（4-1）。
// 参加人数（13/14）に応じて必要な村人数が変わる。
export function validateRoleAssignment(players: Player[]): RoleValidation {
  const roleCounts = roleCountsFor(players.length)
  const projected: Record<RoleKey, number> = { villager: 0, wolf: 0, madman: 0, seer: 0, medium: 0, bodyguard: 0 }
  for (const p of players) {
    const role = p.actualRole ?? 'villager'
    projected[role]++
  }
  const issues: string[] = []
  for (const role of Object.keys(roleCounts) as RoleKey[]) {
    if (projected[role] !== roleCounts[role]) {
      issues.push(`${role}: ${projected[role]}/${roleCounts[role]}`)
    }
  }
  return { valid: issues.length === 0, projectedCounts: projected, issues }
}
