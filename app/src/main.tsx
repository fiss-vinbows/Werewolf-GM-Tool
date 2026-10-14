import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, useUiStore } from './store/uiStore'

// 保存済みの配色を描画前に反映し、設定が変わったら追従する（白→黒のちらつき防止）。
applyTheme(useUiStore.getState().theme)
useUiStore.subscribe((s) => applyTheme(s.theme))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
