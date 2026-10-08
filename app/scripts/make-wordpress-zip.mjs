// WordPressのサーバーへアップロードする zip を作成する。dist-wordpress の中身を wolf フォルダにまとめて
// release/ に出力する。サーバーのファイルマネージャーでWordPressと同じ階層（public_html 等）に展開すると
// https://（サイト）/wolf/ で開ける。
import { execFileSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const version = process.env.npm_package_version ?? '0.0.0'
const work = join('release', 'wordpress')
rmSync(work, { recursive: true, force: true })
cpSync('dist-wordpress', join(work, 'wolf'), { recursive: true })
const zipPath = join('release', `WerewolfGMTool-WordPress-${version}.zip`)
rmSync(zipPath, { force: true })
// Windows標準のPowerShellでzip化する（追加ソフト不要）。
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${join(work, 'wolf')}' -DestinationPath '${zipPath}' -Force`], {
  stdio: 'inherit',
})
console.log(`作成しました: ${zipPath}`)
