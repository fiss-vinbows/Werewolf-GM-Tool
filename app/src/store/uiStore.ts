import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 画面の配色。'system' は端末（OS・ブラウザ）の設定に合わせる。
export type ThemeMode = 'system' | 'light' | 'dark'

// 表示に関する設定。ゲーム記録とは別に保存し、新規ゲームやリセットでも消えない。
type UiStore = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'wolf-gm-tool-ui' },
  ),
)

// <html data-theme="..."> を切り替えて、index.css の配色を反映する。
export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
