import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'

// 情報タブに表示するバージョンとビルド日（package.json の version を使う）。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
const buildDate = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })

// https://vite.dev/config/
// --mode electron：PC用アプリ向けビルド。file相当の独自スキームで読み込むため相対パスにし、
// サービスワーカー（PWA）は使わない。
// --mode standalone：配布用zip向けビルド。全ファイルを1つのHTMLにまとめ、ダブルクリック（file://）で
// 通信なしに開けるようにする。サービスワーカー（PWA）は使わない。
// --mode wordpress：WordPressのサーバーの wp-content/werewolf フォルダに置く向けのビルド
// （https://fiss-vinbows.jp/wp-content/werewolf/）。PWAはそのまま使う
// （スマートフォンのホーム画面に追加でき、1度開けばオフラインでも動く）。
const outDirs: Record<string, string> = { standalone: 'dist-standalone', wordpress: 'dist-wordpress' }
// WordPress版の置き場所（URLのパス）。変更する場合は scripts/make-wordpress-folder.mjs のフォルダ名も合わせる。
const WORDPRESS_BASE = '/wp-content/werewolf/'
// WordPress版の公開先。リンクカード（OGP）の画像・URLは絶対URLが必要なため、この値から作る。
const WORDPRESS_ORIGIN = 'https://fiss-vinbows.jp'

// リンクカード用のOGP（ページ情報）をindex.htmlへ追加する。画像とURLは公開先が決まっているWordPress版のみ。
const NL = String.fromCharCode(10)
function ogpPlugin(mode: string): Plugin {
  const title = '人狼GM記録ツール'
  const description = 'アルティメット人狼の対面プレイ用、GM専用の進行記録ツール（AIプレイヤー参加対応）'
  const pageUrl = WORDPRESS_ORIGIN + WORDPRESS_BASE
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${title}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...(mode === 'wordpress'
      ? [
          `<meta property="og:url" content="${pageUrl}" />`,
          `<meta property="og:image" content="${pageUrl}pwa-512x512.png" />`,
          `<meta property="og:image:width" content="512" />`,
          `<meta property="og:image:height" content="512" />`,
        ]
      : []),
  ]
  return {
    name: 'werewolf-ogp',
    transformIndexHtml: (html) => html.replace('</head>', tags.map((t) => `    ${t}`).join(NL) + NL + '  </head>'),
  }
}
export default defineConfig(({ mode }) => ({
  base: mode === 'electron' || mode === 'standalone' ? './' : mode === 'wordpress' ? WORDPRESS_BASE : '/',
  build: outDirs[mode] ? { outDir: outDirs[mode] } : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    react(),
    ogpPlugin(mode),
    mode === 'standalone' && viteSingleFile(),
    mode !== 'electron' &&
      mode !== 'standalone' &&
      VitePWA({
        registerType: 'autoUpdate',
        // オフライン起動を優先するため、ビルド成果物一式をキャッシュ対象にする。
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        manifest: {
          name: '人狼GM記録ツール',
          short_name: '人狼GM',
          description: '対面人狼のGM専用・進行記録ツール',
          start_url: '.',
          display: 'standalone',
          background_color: '#1b1b1f',
          theme_color: '#1b1b1f',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
  ],
}))
