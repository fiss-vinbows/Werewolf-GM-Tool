import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { numberOptions, type WheelOption } from './wheelOptions'

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

type WheelFieldProps = {
  value: number | null
  options: WheelOption[]
  onCommit: (value: number | null) => void
  unit?: string // 数字の後ろに付ける単位（分・人・戦など）
  title?: string // 選択画面の見出し
  fallback: ReactNode // マウス・キーボード操作時に表示する従来の入力欄
}

// 数字の設定欄。タッチ操作のときは設定された数字だけを表示し、タップすると
// iPhoneのアラーム設定のように上下にスライド（回転）して選ぶ画面を開く。
// マウス・キーボードのときは fallback（従来の入力欄）をそのまま表示する。
export function WheelField(props: WheelFieldProps) {
  const touch = useTouchMode()
  return touch ? <WheelPicker {...props} /> : <>{props.fallback}</>
}

function indexOfValue(options: WheelOption[], value: number | null): number {
  const i = options.findIndex((o) => o.value === value)
  return i >= 0 ? i : 0
}

function WheelPicker({ value, options, onCommit, unit = '', title = '数字を選ぶ' }: WheelFieldProps) {
  const current = indexOfValue(options, value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(current)
  const currentLabel = options[current]?.label ?? ''
  return (
    <>
      <button
        type="button"
        className="wheel-display"
        onClick={(e) => {
          // label の中に置かれても、ほかの要素へクリックが伝わらないようにする。
          e.preventDefault()
          setDraft(current)
          setOpen(true)
        }}
      >
        {currentLabel}
        {options[current]?.value != null && unit}
      </button>
      {/* 選択画面は body 直下に出す（label の中に置くと、画面内のタップが数字表示のボタンへ伝わるため）。 */}
      {open &&
        createPortal(
          <div className="wheel-sheet-backdrop" onClick={() => setOpen(false)}>
            <div className="wheel-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
              <div className="wheel-sheet-actions">
                <button type="button" onClick={() => setOpen(false)}>
                  キャンセル
                </button>
                <b>{title}</b>
                <button
                  type="button"
                  className="wheel-sheet-ok"
                  onClick={() => {
                    if (draft !== current) onCommit(options[draft].value)
                    setOpen(false)
                  }}
                >
                  決定
                </button>
              </div>
              <Wheel options={options} index={draft} onChange={setDraft} unit={unit} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Wheel({ options, index, onChange, unit }: { options: WheelOption[]; index: number; onChange: (index: number) => void; unit: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // 開いたときに、今の値の位置までスクロールしておく。
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ITEM_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)))
    if (i !== index) onChange(i)
  }

  return (
    <div className="wheel" style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}>
      <div className="wheel-band" style={{ top: ITEM_HEIGHT * 2, height: ITEM_HEIGHT }} />
      <div
        ref={ref}
        className="wheel-scroll"
        role="listbox"
        onScroll={handleScroll}
        style={{ paddingTop: ITEM_HEIGHT * 2, paddingBottom: ITEM_HEIGHT * 2 }}
      >
        {options.map((o, i) => (
          <div
            key={o.label}
            role="option"
            aria-selected={i === index}
            className={`wheel-item${i === index ? ' selected' : ''}`}
            style={{ height: ITEM_HEIGHT }}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' })}
          >
            {o.label}
          </div>
        ))}
      </div>
      {unit && <span className="wheel-unit">{unit}</span>}
    </div>
  )
}

// フォーカスを外した時点で確定する数値入力（マウス・キーボード用の従来の入力欄）。
// key に値を渡して使うと、別の画面で値が変わったときに作り直して表示を合わせられる。
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  allowEmpty = false,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  min: number
  max: number
  allowEmpty?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  return (
    <input
      type="number"
      min={min}
      max={max}
      style={{ width: 70 }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === '' && allowEmpty) return onCommit(null)
        onCommit(Math.max(min, Math.min(max, Number(text) || min)))
      }}
    />
  )
}

const TIMER_MINUTE_OPTIONS = numberOptions(0, 60)

// 議論タイマーの時間（分）の設定欄。設定画面と昼画面で共通に使う。
export function TimerMinutesField({ minutes, onCommit }: { minutes: number; onCommit: (minutes: number) => void }) {
  return (
    <WheelField
      value={minutes}
      options={TIMER_MINUTE_OPTIONS}
      unit="分"
      title="議論タイマー"
      onCommit={(v) => onCommit(v ?? 0)}
      fallback={<NumberInput key={minutes} value={minutes} min={0} max={60} onCommit={(v) => onCommit(v ?? 0)} />}
    />
  )
}
