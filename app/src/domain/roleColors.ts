import type { RoleKey } from './types'

// 役職ごとの表示色。RoleBoard・DayScreenの両方で色分けを揃えるために共有する。
export const ROLE_COLORS: Record<RoleKey, string> = {
  wolf: '#c0392b',
  madman: '#8e44ad',
  seer: '#2980b9',
  medium: '#16a085',
  bodyguard: '#d68910',
  villager: '#546e7a',
}
