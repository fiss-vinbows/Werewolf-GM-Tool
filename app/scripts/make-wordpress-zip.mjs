// WordPressのサーバーへアップロードする zip を作成する。dist-wordpress の中身を werewolf フォルダにまとめて
// release/ に出力する。サーバーのファイルマネージャーで wp-content フォルダに展開すると
// https://fiss-vinbows.jp/wp-content/werewolf/ で開ける。
import { execFileSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const version = process.env.npm_package_version ?? '0.0.0'
const work = join('release', 'wordpress')
rmSync(work, { recursive: true, force: true })
cpSync('dist-wordpress', join(work, 'werewolf'), { recursive: true })
const zipPath = join('release', `WerewolfGMTool-WordPress-${version}.zip`)
rmSync(zipPath, { force: true })
// Windows標準のtar（bsdtar）でzip化する。PowerShellのCompress-Archiveはフォルダ区切りが「\」になり、
// Linuxのサーバーで展開すると正しいフォルダにならないことがあるため使わない。
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, ['-a', '-c', '-f', zipPath, '-C', work, 'werewolf'], { stdio: 'inherit' })
console.log(`作成しました: ${zipPath}`)
