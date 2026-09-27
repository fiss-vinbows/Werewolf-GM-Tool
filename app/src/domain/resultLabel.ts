import type { ResultLabelStyle } from './types'

// 人狼／人間ではないの表記を、設定に応じて「人狼・人間」または「黒・白」に統一する。
export function formatWolfResult(result: 'wolf' | 'not-wolf', style: ResultLabelStyle): string {
  if (style === 'black-white') return result === 'wolf' ? '黒' : '白'
  return result === 'wolf' ? '人狼' : '人間'
}
