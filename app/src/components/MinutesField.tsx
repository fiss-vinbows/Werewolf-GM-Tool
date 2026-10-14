import { useEffect, useRef, useState } from 'react'

const ITEM_HEIGHT = 34 // ドラムの1行の高さ（px）
const VISIBLE_ROWS = 5 // 見えている行数（中央の行が選択中）

// タッチパネルで操作しているか。主な入力がタッチの端末を初期値にし、
// その後は実際に触った入力（指かマウスか）に合わせて切り替える（タッチ対応ノートPCなど向け）。
function useTouchMode(): boolean {
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true)
      else if (e.pointerType === 'mouse') setTouch(false)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [])
  return touch
}

// 分の入力欄。タッチ操作のときだけ、iPhoneのアラーム設定のように上下にスライドして選ぶドラム式にする。
// マウス・キーボードのときは従来どおりの数値入力（フォーカスを外した時点で確定）。
export function MinutesField({ value, onCommit, max = 60 }: { value: number; onCommit: (minutes: number) => void; max?: number }) {
  const touch = useTouchMode()
  return touch ? <MinutesWheel value={value} onCommit={onCommit} max={max} /> : <MinutesInput value={value} onCommit={onCommit} max={max} />
}

function MinutesInput({ value, onCommit, max }: { value: number; onCommit: (minutes: number) => void; max: number }) {
  const [text, setText] = useState(String(value))
  // 他の画面（ドラム式など）で変更されたときも表示を合わせる。
  useEffect(() => setText(String(value)), [value])
  return (
    <input
      type="number"
      min={0}
      max={max}
      style={{ width: 60 }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(Number(text) || 0)}
    />
  )
}

function MinutesWheel({ value, onCommit, max }: { value: number; onCommit: (minutes: number) => void; max: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const values = Array.from({ length: max + 1 }, (_, i) => i)
  const clamped = Math.max(0, Math.min(max, Math.round(value)))
  const [shown, setShown] = useState(clamped)

  // 外から値が変わったら（初期表示を含む）、その位置までスクロールしておく。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = clamped * ITEM_HEIGHT
    setShown(clamped)
  }, [clamped])

  useEffect(() => () => window.clearTimeout(settleTimer.current), [])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const idx = Math.max(0, Math.min(max, Math.round(el.scrollTop / ITEM_HEIGHT)))
    setShown(idx)
    // 指を離して慣性スクロールが止まってから確定する（スクロール中に何度もタイマーをリセットしないため）。
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      if (idx !== clamped) onCommit(idx)
    }, 150)
  }

  return (
    <div className="minutes-wheel" style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}>
      <div className="minutes-wheel-band" style={{ top: ITEM_HEIGHT * 2, height: ITEM_HEIGHT }} />
      <div
        ref={ref}
        className="minutes-wheel-scroll"
        role="listbox"
        aria-label="分"
        onScroll={handleScroll}
        style={{ paddingTop: ITEM_HEIGHT * 2, paddingBottom: ITEM_HEIGHT * 2 }}
      >
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === shown}
            className={`minutes-wheel-item${v === shown ? ' selected' : ''}`}
            style={{ height: ITEM_HEIGHT }}
            onClick={() => ref.current?.scrollTo({ top: v * ITEM_HEIGHT, behavior: 'smooth' })}
          >
            {v}
          </div>
        ))}
      </div>
      <span className="minutes-wheel-unit">分</span>
    </div>
  )
}
