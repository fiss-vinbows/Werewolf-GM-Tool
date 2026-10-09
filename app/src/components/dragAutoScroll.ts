// ドラッグ中に指（ポインタ）が画面の上端・下端に近づいたら、自動で縦スクロールする。
// スマートフォンでは画面外のプレイヤーへ投票・判定をドラッグできなかったため（2026-10-09）。
const EDGE = 70 // 端からこの距離（px）に入るとスクロールを始める
const MAX_SPEED = 18 // 1フレームあたりの最大スクロール量（px）

export type DragAutoScroll = {
  // ポインタの位置を伝える。pointermove のたびに呼ぶ。
  update: (clientY: number) => void
  stop: () => void
}

// onScroll：スクロールした後に呼ぶ（ドロップ先のハイライトを、指の下の要素に合わせて更新するため）。
export function startDragAutoScroll(onScroll?: () => void): DragAutoScroll {
  let y: number | null = null
  // 一定間隔（約60回/秒）で位置を確認する。requestAnimationFrame は画面が非表示だと止まるため使わない。
  const tick = () => {
    if (y !== null) {
      const h = window.innerHeight
      let dy = 0
      if (y < EDGE) dy = -Math.ceil(((EDGE - y) / EDGE) * MAX_SPEED)
      else if (y > h - EDGE) dy = Math.ceil(((y - (h - EDGE)) / EDGE) * MAX_SPEED)
      if (dy !== 0) {
        const before = window.scrollY
        window.scrollBy(0, dy)
        if (window.scrollY !== before) onScroll?.()
      }
    }
  }
  const timer = window.setInterval(tick, 16)
  return {
    update: (clientY) => {
      y = clientY
    },
    stop: () => {
      window.clearInterval(timer)
      y = null
    },
  }
}
