// WordPressのサーバーへアップロードするフォルダを作成する（2026-10-10からzipにせずフォルダのまま出力）。
// dist-wordpress の中身を release/WerewolfGMTool-WordPress-<版>/werewolf にコピーする。
// この werewolf フォルダの中身をサーバーの wp-content/werewolf/ にアップロードすると
// https://fiss-vinbows.jp/wp-content/werewolf/ で開ける。
import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const version = process.env.npm_package_version ?? '0.0.0'
const outDir = join('release', `WerewolfGMTool-WordPress-${version}`)
rmSync(outDir, { recursive: true, force: true })
cpSync('dist-wordpress', join(outDir, 'werewolf'), { recursive: true })
console.log(`作成しました: ${join(outDir, 'werewolf')}`)
