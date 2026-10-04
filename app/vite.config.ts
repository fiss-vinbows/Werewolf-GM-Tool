import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
// --mode electron：PC用アプリ向けビルド。file相当の独自スキームで読み込むため相対パスにし、
// サービスワーカー（PWA）は使わない。
// --mode standalone：配布用zip向けビルド。全ファイルを1つのHTMLにまとめ、ダブルクリック（file://）で
// 通信なしに開けるようにする。サービスワーカー（PWA）は使わない。
export default defineConfig(({ mode }) => ({
  base: mode === 'electron' || mode === 'standalone' ? './' : '/',
  build: mode === 'standalone' ? { outDir: 'dist-standalone' } : undefined,
  plugins: [
    react(),
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
