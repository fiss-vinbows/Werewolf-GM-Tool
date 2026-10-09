# Werewolf GM Tool（人狼GM記録ツール）

アルティメット人狼（13〜14人）を対面で遊ぶときの、GM専用の進行記録ツールです。
CO・投票・夜の行動・勝敗を記録し、AIプレイヤー1人を参加させることもできます。
ブラウザで動くWebアプリ（PWA）で、PC・スマートフォンのどちらでも使え、1度開けばオフラインでも動作します。

- バージョン：1.0.4
- ホームページ：https://fiss-vinbows.jp/werewolf-game/
- アプリ：https://fiss-vinbows.jp/wp-content/werewolf/
- ライセンス：MIT License（[LICENSE](LICENSE)）

## 主な機能

| タブ | できること |
|---|---|
| 参加者選出 | 参加者名簿から、複数戦で参加回数がなるべく均等になる組み合わせを作る |
| プレイヤー登録 | 13人／14人の登録、AIの指定、実際の役職のドラッグ割り振り、初日白の抽選 |
| 昼・CO | 議論タイマー、役職COと予言・霊媒・護衛（○・G）の結果公表をドラッグで記録 |
| 投票 | 通常投票・決選投票をドラッグで記録。投票中のCOと結果の開示、処刑者の遺言でのCO・結果公表 |
| 夜 | 人狼→予言者→霊媒師→狩人の順に記録。判定結果と護衛・襲撃の成否は自動判定 |
| 訂正 | 「1つ戻る」で誤入力を取り消す |
| AI記録 | AIの投票・夜行動の判断と、その理由（GM専用）を振り返る |
| 保存・終了 | 勝敗の確定、JSON・テキスト・スプレッドシート用CSVの書き出し |
| 設定・情報 | 役職名・表示方法などの設定、バージョン情報 |

- 記録はブラウザ内に自動保存されます（端末ごと。PCとスマートフォンでは共有されません）。
- スマートフォンでは、投票先やCOボードを2列に並べ、ドラッグ中に画面の端へ近づくと自動でスクロールします。

### AIプレイヤー

公開情報と自分の役職で知り得る情報だけを使う、ルールベースのAIです。COや結果公表はせず、投票と夜の行動（予言・護衛・最後の人狼の襲撃）を行います。

- `app/src/domain/ai/view.ts` … AIが知ってよい情報だけを取り出す
- `app/src/domain/ai/analysis.ts` … 確定白・確定人狼・破綻・処刑余裕数・ローラー・評価点などの分析
- `app/src/domain/ai/vote.ts` … 投票の判断
- `app/src/domain/ai/night.ts` … 夜の行動の判断
- `app/src/domain/ai/params.ts` … 評価点などの調整用の値

判断の方針は [docs/人狼AI_仕様プラン.txt](docs/人狼AI_仕様プラン.txt) にまとめています。

## 開発

```bash
cd app
npm install
npm run dev      # 開発サーバー
npm test         # テスト
npm run build    # 本番ビルド（型チェック込み）
npm run preview  # 本番ビルドの確認（オフライン動作の確認にも使う）
```

### シミュレーション

13人全員をAIにした自動対局で、AIの値（評価点など）を比較できます。COと結果公表は、人間の動きをまねた簡単なモデルで行います。

```bash
cd app
npm run sim -- --games 4000 --seed 11 --params '{"weightScale":10}'
npx vite-node src/sim/csv-one.ts -- --seed 3 --pattern madSeer --ai p7 --out ../sim.csv  # 1戦をCSVで書き出す
```

## 公開・配布

### WordPressのサーバーに置く（現在の運用）

```bash
npm --prefix app run dist:wordpress
```

1. `app/release/WerewolfGMTool-WordPress-<版>/werewolf` フォルダができます（`app/dist-wordpress` と同じ中身）。
2. その中身を、サーバーの `wp-content/werewolf/` にアップロードして上書きします。`assets` フォルダ・`sw.js`・`workbox-〜.js` も忘れずにアップロードしてください。
3. `https://fiss-vinbows.jp/wp-content/werewolf/` を開き、「情報」タブのバージョンで反映を確認します。開いたことのある端末では、1回目は古い版が表示されることがあります。

置き場所を変える場合は、`app/vite.config.ts` の `WORDPRESS_BASE`・`WORDPRESS_ORIGIN` と、`app/scripts/make-wordpress-folder.mjs` のフォルダ名を変更してからビルドします。

### その他の形（現在は使っていない）

- **Windows版（Electron）：** `npm run electron` で起動、`npm run dist:win` で `app/release/` にインストーラー版とポータブル版を作成します。コード署名をしていないため、初回起動時にWindows SmartScreenの警告が出ることがあります。
- **通信不要版（1つのHTMLファイル）：** `npm run dist:zip` で `app/release/` に作成します。ダブルクリックで開けますが、ホーム画面への追加（PWA）は使えません。

## ディレクトリ構成

- `app/` — アプリ本体（React + TypeScript + Vite）
  - `src/components/` — 画面
  - `src/domain/` — 記録のデータ構造・書き出し・AIの判断
  - `src/store/` — 状態管理（zustand）
  - `src/sim/` — 全員AIのシミュレーション
- `docs/` — 仕様書・確認事項リスト・既存ツール調査などの検討資料（日本語）

## ライセンス

MIT License です。詳しくは [LICENSE](LICENSE) を参照してください。

Copyright (c) 2026 fiss-vinbows
