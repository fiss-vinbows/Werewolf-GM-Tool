import { useState, type ReactNode } from 'react'

// 折りたためる操作説明。開いた・閉じたの状態は端末ごとに覚えておく（初期状態は閉じる）。
export function HelpNote({ id, children }: { id: string; children: ReactNode }) {
  const key = `wolf-gm-tool-help-${id}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === 'open'
    } catch {
      return false
    }
  })
  return (
    <details
      className="help-note"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open
        setOpen(next)
        try {
          localStorage.setItem(key, next ? 'open' : 'closed')
        } catch {
          // 保存できない環境では、開閉状態を覚えないだけにする。
        }
      }}
    >
      <summary>操作の説明</summary>
      <p className="hint">{children}</p>
    </details>
  )
}
