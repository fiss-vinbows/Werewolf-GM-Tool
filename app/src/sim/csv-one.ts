// シミュレーションを1戦行い、スプレッドシート用CSVを書き出す（例：npx vite-node src/sim/csv-one.ts -- --seed 3 --pattern madSeer --ai p7 --out sim.csv）。
// AIの印は --ai で指定したプレイヤーに付ける（シミュレーションでは全員がAIの判断で動く）。
import { writeFileSync } from 'node:fs'
import { DEFAULT_AI_PARAMS } from '../domain/ai/params'
import { exportResultCsv } from '../domain/exportCsv'
import { seededRng, simulateGame, type FakePattern } from './simulate'

const args = process.argv.slice(2)
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const r = simulateGame(DEFAULT_AI_PARAMS, arg('pattern', 'madSeer') as FakePattern, seededRng(Number(arg('seed', '1'))))
const g = r.game
const ai = arg('ai', '')
g.players = g.players.map((p) => ({ ...p, isAi: p.id === ai }))
const csv = exportResultCsv(g)
writeFileSync(arg('out', 'sim.csv'), csv, 'utf-8')
console.log(`勝利：${r.winner}／${r.days}日目で終了／騙りの型：${r.pattern}`)
