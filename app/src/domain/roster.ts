// 参加者選出（13〜14人を超える参加者から、複数戦でまんべんなく参加できるように選ぶ）。

export type RosterMember = { id: string; name: string; present: boolean }

export type RosterGame = {
  id: string
  index: number // 何戦目か（1始まり）
  participantIds: string[]
  status: 'planned' | 'played'
}

// 残りの試合の参加者を割り当てる。参加回数（済み＋予定）が少ない人を優先し、
// 同数なら直前の試合を休んだ人を優先、それでも同じならランダム。
export function planSchedule(input: {
  memberIds: string[]
  // 既に終了した試合（順番どおり）。回数と「直前に休んだか」の判定に使う。
  playedGames: string[][]
  remainingGames: number
  seats: number
  rng?: () => number
}): string[][] {
  const rng = input.rng ?? Math.random
  const counts = new Map(input.memberIds.map((id) => [id, 0]))
  for (const g of input.playedGames) for (const id of g) if (counts.has(id)) counts.set(id, counts.get(id)! + 1)
  let previous = new Set(input.playedGames[input.playedGames.length - 1] ?? [])
  const seats = Math.min(input.seats, input.memberIds.length)
  const result: string[][] = []
  for (let i = 0; i < input.remainingGames; i++) {
    const keyed = input.memberIds.map((id) => ({ id, count: counts.get(id)!, playedPrev: previous.has(id) ? 1 : 0, r: rng() }))
    keyed.sort((a, b) => a.count - b.count || a.playedPrev - b.playedPrev || a.r - b.r)
    const chosen = keyed.slice(0, seats).map((k) => k.id)
    // 表示を安定させるため、名簿の順に並べる。
    const chosenSet = new Set(chosen)
    const ordered = input.memberIds.filter((id) => chosenSet.has(id))
    for (const id of ordered) counts.set(id, counts.get(id)! + 1)
    result.push(ordered)
    previous = chosenSet
  }
  return result
}
