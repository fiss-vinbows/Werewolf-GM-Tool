import type { PauseInterval } from './types'

// atIso時点までに完了・進行中だった一時停止の合計時間（ミリ秒）。
// atIso以降に始まった一時停止は対象に含めない（過去の記録の表示が、後の一時停止で変わらないようにする）。
function pausedMsBefore(intervals: PauseInterval[], atIso: string): number {
  const at = new Date(atIso).getTime()
  let total = 0
  for (const iv of intervals) {
    const start = new Date(iv.start).getTime()
    if (start >= at) continue
    const end = iv.end ? new Date(iv.end).getTime() : at
    total += Math.max(0, Math.min(end, at) - start)
  }
  return total
}

// 一時停止していた時間を差し引いた経過時間（ミリ秒）を返す。
export function elapsedMs(fromIso: string, toIso: string, intervals: PauseInterval[]): number {
  const raw = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.max(0, raw - pausedMsBefore(intervals, toIso))
}
