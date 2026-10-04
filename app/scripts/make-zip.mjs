// 配布用zip（通信不要版）を作成する。dist-standalone/index.html と説明書をまとめて release/ に出力する。
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const version = process.env.npm_package_version ?? '0.0.0'
const work = join('release', 'WerewolfGMTool-Offline')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
copyFileSync(join('dist-standalone', 'index.html'), join(work, '人狼GM記録ツール.html'))
writeFileSync(
  join(work, 'はじめにお読みください.txt'),
  [
    '人狼GM記録ツール（通信不要版）',
    '',
    '使い方',
    '・「人狼GM記録ツール.html」をダブルクリックすると、ブラウザ（Chrome・Edge推奨）で開きます。',
    '・インターネット接続は不要です。USBメモリ等にコピーしてそのまま使えます。',
    '',
    '注意',
    '・記録はブラウザ内に自動保存されます。ブラウザや保存場所（フォルダ）を変えると、別の記録として扱われます。',
    '・大事な記録は「保存・終了」タブから書き出してください。',
    '・この版ではホーム画面への追加（PWA）は使えません。',
    '',
  ].join('\r\n'),
)
const zipPath = join('release', `WerewolfGMTool-Offline-${version}.zip`)
rmSync(zipPath, { force: true })
// Windows標準のPowerShellでzip化する（追加ソフト不要）。
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${work}\\*' -DestinationPath '${zipPath}' -Force`], {
  stdio: 'inherit',
})
console.log(`作成しました: ${zipPath}`)
