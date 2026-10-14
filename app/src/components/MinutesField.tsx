import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const ITEM_HEIGHT = 34 // ドラムの1行の高さ（px）
const VISIBLE_ROWS = 5 // 見えている行数（中央の行が選択中）

// タッチパネルで操作しているか。主な入力がタッチの端末を初期値にし、
// その後は実際に触った入力（指かマウスか）に合わせて切り替える（タッチ対応ノートPCなど向け）。
// タブを移っても判定が初期値に戻らないよう、アプリ全体で1つの値を共有する。
let touchMode = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const touchListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      const next = e.pointerType === 'touch' ? true : e.pointerType === 'mouse' ? false : touchMode
      if (next === touchMode) return
      touchMode = next
      touchListeners.forEach((fn) => fn())
    },
    { capture: true },
  )
}

function useTouchMode(): boolean {
  return useSyncExternalStore(
    (fn) => {
      touchListeners.add(fn)
      return () => touchListeners.delete(fn)
    },
    () => touchMode,
  )
}

// 分の入力欄。タッチ操作のときは設定された数字だけを表示し、タップすると
// iPhoneのアラーム設定のように上下にスライドして選ぶ画面を開く。
// マウス・キーボードのときは従来どおりの数値入力（フォーカスを外した時点で確定）。
// 数値入力は key に値を渡し、別の画面で値が変わったら作り直して表示を合わせる。
export function MinutesField({ value, onCommit, max = 60 }: { value: number; onCommit: (minutes: number) => void; max?: number }) {
  const touch = useTouchMode()
  return touch ? <MinutesPicker value={value} onCommit={onCommit} max={max} /> : <MinutesInput key={value} value={value} onCommit={onCommit} max={max} />
}

function MinutesInput({ value, onCommit, max }: { value: number; onCommit: (minutes: number) => void; max: number }) {
  const [text, setText] = useState(String(value))
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

function MinutesPicker({ value, onCommit, max }: { value: number; onCommit: (minutes: number) => void; max: number }) {
  const clamped = Math.max(0, Math.min(max, Math.round(value)))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(clamped)
  return (
    <>
      <button
        type="button"
        className="minutes-display"
        onClick={(e) => {
          // label の中に置かれても、ほかの要素へクリックが伝わらないようにする。
          e.preventDefault()
          setDraft(clamped)
          setOpen(true)
        }}
      >
        {clamped}分
      </button>
      {/* 選択画面は body 直下に出す（label の中に置くと、画面内のタップが数字表示のボタンへ伝わるため）。 */}
      {open &&
        createPortal(
        <div className="minutes-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="minutes-sheet" role="dialog" aria-label="時間を選ぶ" onClick={(e) => e.stopPropagation()}>
            <div className="minutes-sheet-actions">
              <button type="button" onClick={() => setOpen(false)}>
                キャンセル
              </button>
              <b>時間を選ぶ</b>
              <button
                type="button"
                className="minutes-sheet-ok"
                onClick={() => {
                  if (draft !== clamped) onCommit(draft)
                  setOpen(false)
                }}
              >
                決定
              </button>
            </div>
            <MinutesWheel value={draft} onChange={setDraft} max={max} />
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}

function MinutesWheel({ value, onChange, max }: { value: number; onChange: (minutes: number) => void; max: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const values = Array.from({ length: max + 1 }, (_, i) => i)

  // 開いたときに、今の値の位置までスクロールしておく。
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ITEM_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const idx = Math.max(0, Math.min(max, Math.round(el.scrollTop / ITEM_HEIGHT)))
    if (idx !== value) onChange(idx)
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
            aria-selected={v === value}
            className={`minutes-wheel-item${v === value ? ' selected' : ''}`}
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
