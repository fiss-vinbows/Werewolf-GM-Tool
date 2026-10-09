// シミュレーションの実行（例：npx vite-node src/sim/run.ts -- --games 500 --seed 1）。
// 指定したパラメータで、騙りパターンごとに同数のゲームを行い、村人陣営の勝率を出力する。
// 出力は1行のJSON（並列実行スクリプトから集計する）。
import { DEFAULT_AI_PARAMS, type AiParams } from '../domain/ai/params'
import { FAKE_PATTERNS, seededRng, simulateGame } from './simulate'

const args = process.argv.slice(2)
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const games = Number(arg('games', '100'))
const seed = Number(arg('seed', '1'))
const params: AiParams = { ...DEFAULT_AI_PARAMS, ...JSON.parse(arg('params', '{}')) }

const t0 = Date.now()
const byPattern: Record<string, { village: number; wolf: number; draw: number; days: number }> = {}
for (const p of FAKE_PATTERNS) byPattern[p] = { village: 0, wolf: 0, draw: 0, days: 0 }
for (let i = 0; i < games; i++) {
  const pattern = FAKE_PATTERNS[i % FAKE_PATTERNS.length]
  const r = simulateGame(params, pattern, seededRng(seed * 1_000_003 + i))
  byPattern[pattern][r.winner] += 1
  byPattern[pattern].days += r.days
}
const total = Object.values(byPattern).reduce((a, b) => ({ village: a.village + b.village, wolf: a.wolf + b.wolf, draw: a.draw + b.draw, days: a.days + b.days }), { village: 0, wolf: 0, draw: 0, days: 0 })
console.log(JSON.stringify({ params, games, seed, ms: Date.now() - t0, total, byPattern }))
