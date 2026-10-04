// 人狼GM記録ツール ドメイン型定義
// 仕様プラン v0.28 の第1段階（GM用記録ツール）を対象とする。

export type RoleKey =
  | 'villager'
  | 'wolf'
  | 'madman'
  | 'seer'
  | 'medium'
  | 'bodyguard'

// 役職の識別情報(RoleKey)と表示名を分離する(4-9)。
export const DEFAULT_ROLE_NAMES: Record<RoleKey, string> = {
  villager: '村人',
  wolf: '人狼',
  madman: '狂人',
  seer: '予言者',
  medium: '霊媒師',
  bodyguard: '狩人',
}

// 13人時の基準人数（村人以外は人数が変わっても固定。村人だけが人数調整に使う枠）。
export const ROLE_COUNTS: Record<RoleKey, number> = {
  wolf: 3,
  madman: 1,
  seer: 1,
  medium: 1,
  bodyguard: 1,
  villager: 6,
}

export const SUPPORTED_PLAYER_COUNTS = [13, 14] as const
export type SupportedPlayerCount = (typeof SUPPORTED_PLAYER_COUNTS)[number]

// 人狼・狂人・予言者・霊媒師・狩人の人数は13人時と同じ7人のまま固定し、
// 増えた分はすべて村人に割り当てる（14人時は村人+1、2026-10-04確定）。
const FIXED_ROLE_TOTAL = ROLE_COUNTS.wolf + ROLE_COUNTS.madman + ROLE_COUNTS.seer + ROLE_COUNTS.medium + ROLE_COUNTS.bodyguard

export function roleCountsFor(playerCount: number): Record<RoleKey, number> {
  return { ...ROLE_COUNTS, villager: Math.max(0, playerCount - FIXED_ROLE_TOTAL) }
}

// 役職確認順(3章)。
export const ROLE_CONFIRM_ORDER: RoleKey[] = [
  'wolf',
  'seer',
  'medium',
  'bodyguard',
  'madman',
]

// 表示レイアウト用のグルーピング：人狼陣営、村の特殊役職、村人を段で分ける。
export const ROLE_LAYOUT_ROWS: RoleKey[][] = [
  ['wolf', 'madman'],
  ['seer', 'medium', 'bodyguard'],
  ['villager'],
]

export type PlayerId = string

export type Player = {
  id: PlayerId
  displayName: string
  registrationOrder: number
  isAi: boolean
  // 実役職。役職確認の進行に応じて段階的に入力するため未確定を許容する。
  actualRole: RoleKey | null
  alive: boolean
  death: {
    day: number
    phase: GamePhase
    trueCause: 'execution' | 'wolf-attack' | 'other'
    // 参加者へ公開された死因。GMが口頭で発表する内容と紐づく。
    publicCause: string | null
  } | null
}

export type GamePhase =
  | 'setup' // 開始前：登録・役職確認
  | 'day' // 昼：CO記録
  | 'vote' // 投票（通常/決選）
  | 'execution' // 処刑
  | 'night' // 夜：能力行動
  | 'morning' // 朝：結果公開
  | 'finished'


export type CoStatus = 'active' | 'retracted' | 'changed'

// CO・公表内容(4-3)。実役職とは別データ。
export type CoRecord = {
  id: string
  eventOrder: number
  day: number
  claimedRole: RoleKey
  playerId: PlayerId
  recordedAt: string // ISO時刻。ゲーム内発生時点とは別管理。
  status: CoStatus
  // このCOが別COの変更・撤回である場合、直前のCO IDを保持する（スライド追跡）。
  supersedes: string | null
  note: string
  // 投票中／決選投票中のCOの場合、その時点までのその日の投票通し番号（何票目の後か）。
  afterVoteCount: number | null
  // 撤回・変更（スライド）された時点。破綻解除の判定に使う（7-4）。旧データにはない。
  ended?: EventPoint | null
}

// ゲーム内の発生時点（通し番号と日）。
export type EventPoint = { order: number; day: number }

export type ResultClaimKind = 'seer' | 'medium' | 'guard'

// 公表結果:「発言者／主張した役職／対象者／対象日／結果」(4-3)。
export type ResultClaim = {
  id: string
  eventOrder: number
  coId: string // どのCOに基づく主張かを追跡する。
  kind: ResultClaimKind
  speakerId: PlayerId
  targetId: PlayerId
  targetDay: number // 結果の対象日
  announcedDay: number // 公表した日
  // 護衛主張は guarded（○：護衛した先）と guard-success（G：護衛に成功した先）を使う。
  result: 'wolf' | 'not-wolf' | 'guarded' | 'guard-success'
  recordedAt: string
  retracted: boolean
  // プレイヤーが撤回・訂正した時点（7-4）。旧データにはない。
  retractedAt?: EventPoint | null
}

export type VoteRoundKind = 'normal' | 'runoff1' | 'runoff2'

export type Vote = {
  voterId: PlayerId
  targetId: PlayerId
  recordedAt: string
  // 投票した順番（ラウンド内で単調増加。取り消し後の再投票でも順序が追える）。
  order: number
  // ゲーム全体を通しての投票順（ラウンドをまたいで単調増加）。
  globalOrder: number
  // 投票時点で記録済みだったCO・公表結果の通し番号の最大値（その時点の公表内容の再現用、5-4-4a）。旧データにはない。
  afterEventOrder?: number
}

export type VoteRound = {
  id: string
  day: number
  kind: VoteRoundKind
  // 通常投票のAI中央順(未使用でも保持。AI不在なら常にnull)。
  aiOrder: number | null
  votes: Vote[]
  // 決選投票の対象者(通常投票の最多得票者)。
  candidateIds: PlayerId[]
  executedId: PlayerId | null // 処刑者。処刑なしはnullかつresolvedがtrue。
  resolved: boolean
  nextVoteOrder: number
  // AIの投票判断（4-4・5-2）。旧データには存在しないため省略可能。
  aiDecisions?: AiVoteDecision[]
}

// AIの投票判断の記録。shown=GM画面に表示済み・未発表、announced=GMが口頭発表して票を確定済み、
// superseded=入力訂正などで再判断したため無効（履歴として残す）。
export type AiVoteDecision = {
  id: string
  aiId: PlayerId
  targetId: PlayerId
  // GM用の非公開の判断理由。非公開情報を含み得るため人間プレイヤーには公開しない。
  reasons: string[]
  policyVersion: string
  decidedAt: string
  // 判断時点で見えていた当該ラウンドの票数。
  visibleVoteCount: number
  status: 'shown' | 'announced' | 'superseded'
}

export type SeerAction = {
  day: number
  targetId: PlayerId
  result: 'wolf' | 'not-wolf'
}

export type MediumAction = {
  day: number
  targetId: PlayerId // 処刑者
  result: 'wolf' | 'not-wolf'
}

export type BodyguardAction = {
  day: number
  targetId: PlayerId
  success: boolean // 護衛成功（襲撃対象と一致）
}

export type WolfAction = {
  day: number
  targetId: PlayerId
  success: boolean // 実行結果（護衛失敗時に死亡）
}

export type NightRecord = {
  day: number
  seer: SeerAction | null
  // 真の予言者がすでに死亡しているため、自動的に処理済み扱いにした場合。
  seerSkipped: boolean
  medium: MediumAction | null
  // その日に処刑者がおらず霊媒対象がいないため、自動的に処理済み扱いにした場合。
  mediumSkipped: boolean
  bodyguard: BodyguardAction | null
  // 真の狩人がすでに死亡しているため、自動的に処理済み扱いにした場合。
  guardSkipped: boolean
  wolf: WolfAction | null
}

// 訂正履歴（4-7）。「1つ戻る」用のスナップショット方式。
export type HistoryEntry = {
  label: string
  timestamp: string
  snapshot: string // GameState をシリアライズしたもの
}

export type GameMeta = {
  gameId: string
  createdAt: string
  updatedAt: string
  ruleNote: string
  memo: string
  roleNames: Record<RoleKey, string>
  // 参加人数（13人または14人。増えた分はすべて村人に割り当てる）。登録完了前のみ変更可。
  playerCount: SupportedPlayerCount
  // 通常投票のAI中央投票順の初期値。設定画面で入力し、投票ラウンド開始時の初期値として使う。
  defaultAiOrder: number | null
  // 昼フェイズの議論タイマーの既定の残り時間（秒）。設定画面・昼画面のどちらからも変更できる。
  defaultTimerSeconds: number
  // 人狼／人間ではないの表記方法（黒・白表記との切り替え）。
  resultLabelStyle: ResultLabelStyle
  // 初日白（予言者への通知対象）の決め方。'auto'なら条件が揃った時点でシステムが自動抽選し、
  // 'manual'ならGMが手動で対象を選ぶ（自動抽選は行わない）。
  day1WhiteNoticeMode: Day1WhiteNoticeMode
}

export type Day1WhiteNoticeMode = 'auto' | 'manual'

export type ResultLabelStyle = 'wolf-human' | 'black-white'

// 昼フェイズの議論用タイマー（カウントダウン形式）。
export type DayTimer = {
  running: boolean
  startedAt: string | null // 稼働中の開始時刻（ISO）。停止中はnull。
  durationMs: number // リセット時に戻る設定時間。
  remainingMs: number // 停止中の残り時間。稼働中はstartedAtからの経過分を差し引いて計算する。
}

// 議論タイマーを一時停止していた期間。CO・公表結果の「経過時間」表示から差し引くために使う
// （タイマーを止めている間は経過時間が進んで見えないようにする）。endがnullなら現在も一時停止中。
export type PauseInterval = {
  start: string
  end: string | null
}

export type GameState = {
  meta: GameMeta
  players: Player[]
  day: number
  phase: GamePhase
  coRecords: CoRecord[]
  resultClaims: ResultClaim[]
  voteRounds: VoteRound[]
  nightRecords: NightRecord[]
  eventCounter: number
  // 投票専用の通し番号。CO・公表結果など他のイベントとは数を混同しない（投票の全体順のみを数える）。日をまたぐとリセットする。
  voteEventCounter: number
  dayTimer: DayTimer
  // 議論タイマーを一時停止していた期間の履歴（経過時間表示の計算用）。
  pauseIntervals: PauseInterval[]
  // 議論が終わった（タイマーが0になった、または切り上げボタンが押された）かどうか。
  // trueになるまで投票タブへは移動できない（誤操作防止）。日をまたぐとリセットする。
  discussionEnded: boolean
  // 初日白（人狼以外の1人を予言者へ通知する対象）。人狼全員と予言者本人の登録が揃った時点で
  // 一度だけ抽選し、以後は再抽選しない（3章）。
  day1WhiteNotice: PlayerId | null
  finished: boolean
  winner: 'village' | 'wolf' | null
  history: HistoryEntry[]
  // AIの夜行動の判断記録（5-2）。旧データには存在しないため省略可能。
  aiNightDecisions?: AiNightDecision[]
}

export type AiNightActionKind = 'seer' | 'guard' | 'wolf'

export type AiNightDecision = {
  id: string
  day: number
  aiId: PlayerId
  kind: AiNightActionKind
  targetId: PlayerId
  // 狩人AIの護衛方針（通常の区分／堅実／捨て護衛を区別して保存する）。
  guardMode?: 'seer' | 'medium' | 'other' | 'solid' | 'throwaway'
  // GM用の非公開の判断理由。
  reasons: string[]
  policyVersion: string
  decidedAt: string
}
