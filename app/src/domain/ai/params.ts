// AIの調整用パラメータ。アプリでは既定値を使い、シミュレーション（src/sim）で値を変えて比較する。
export type AiParams = {
  // 評価点（5-4-4a）：投票先の霊媒結果に応じて投票者に付ける点。
  normalWolf: number // 通常投票で人狼へ投票
  normalHuman: number // 通常投票で人間へ投票
  runoffWolf: number // 決選投票で人狼へ投票
  runoffHuman: number // 決選投票で人間へ投票
  // 評価点を選ばれやすさに変える強さ。評価点が weightScale 低いと選ばれやすさ2倍。
  weightScale: number
}

export const DEFAULT_AI_PARAMS: AiParams = {
  normalWolf: 20,
  normalHuman: -10,
  runoffWolf: 5,
  runoffHuman: -3,
  weightScale: 20,
}
