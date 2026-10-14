// 数字の選択肢。value が null の選択肢は「なし」などの未設定を表す。
export type WheelOption = { value: number | null; label: string }

// 連続した数字の選択肢を作る（例：numberOptions(0, 60)）。
export function numberOptions(min: number, max: number): WheelOption[] {
  return Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }))
}
