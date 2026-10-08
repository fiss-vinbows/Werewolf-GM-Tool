# Werewolf GM Tool（人狼GM記録ツール）

アルティメット人狼13〜14人向けの、GM専用の進行記録ツールです。React + TypeScript + Vite + PWAで実装しており、オフラインでも動作します。

## 現状

第1段階（GM用記録ツール）を実装済みです。プレイヤー登録・役職割り振り・CO記録・投票・夜フェイズの自動判定・勝敗判定・記録の書き出しまで一通り動作します。

第2段階（AIプレイヤー）の投票AIと夜行動AIを実装済みです。

- `app/src/domain/ai/view.ts` … AIが知ってよい情報だけを取り出す情報フィルタ（仕様5-1）
- `app/src/domain/ai/analysis.ts` … 確定白・確定人狼・破綻・処刑余裕数・ローラー・評価点などの公開情報分析
- `app/src/domain/ai/vote.ts` … ルールベースの投票判断（方針A〜D、5-4、7-3）
- `app/src/domain/ai/night.ts` … 夜行動の判断（予言対象・護衛・ラストウルフの襲撃）
- 投票画面：AIの順番（通常投票は中央順、決選は人間の票を見る前）で投票先と判断理由（GM専用）を表示し、「発表済み」でAI票を確定

- 夜画面：AIの予言者・狩人・（人間の仲間がいない）人狼の選択と判断理由を表示し、「AIの選択で記録」で反映。人間の人狼が生存中はAI人狼は仲間の決定に従う

## セットアップ

```bash
cd app
npm install
npm run dev
```

## ビルド・オフライン動作の確認

```bash
cd app
npm run build
npm run preview
```

## テスト

```bash
cd app
npm test
```

一度ブラウザでアクセスすればサービスワーカーが全アセットをキャッシュするため、以降はオフラインでも動作します。

## 参加者選出（20人で4戦など）

「参加者選出」タブで名簿を登録し、試合数と1戦の人間の参加人数を決めて「残りの試合の組み合わせを作成」を押すと、参加回数ができるだけ均等になり、2戦続けて休む人が出にくい組み合わせを作ります。試合ごとに「登録へ反映」でプレイヤー登録に名前を流し込み、終わったら「終了済みにする」。途中参加・欠席があれば出席を切り替えて作り直すと、終了済みの試合を考慮して残りの試合を組み直します。

## PC用アプリ（Windows）

Electronでデスクトップアプリとして動かせます。Windows PCで以下を実行します。

```bash
cd app
npm install
npm run electron   # そのまま起動して確認
npm run dist:win   # app/release/ にインストーラー版とポータブル版(.exe)を作成
```

- データ（自動保存・参加者名簿）はアプリ内に保存され、閉じても残ります。ブラウザ版とは別の保存場所です。
- 完全オフラインで動作します。
- コード署名をしていないため、初回起動時にWindows SmartScreenの警告が出ることがあります（「詳細情報」→「実行」）。

## WordPressのサーバーに置く（PC・スマートフォン両対応）

WordPressのサーバーの `wp-content/werewolf` フォルダに置き、
`https://fiss-vinbows.jp/wp-content/werewolf/` でPC・スマートフォンのブラウザから使います。
スマートフォンでは「ホーム画面に追加」でアプリのように使え、1度開けばオフラインでも動きます（PWA）。

```bash
npm --prefix app run dist:wordpress
```

1. `app/release/WerewolfGMTool-WordPress-<版>.zip` ができます（中身は `werewolf` フォルダ）。
2. サーバーのファイルマネージャー（またはFTP）で、WordPressの `wp-content` フォルダにzipをアップロードして展開します。
3. `https://fiss-vinbows.jp/wp-content/werewolf/` を開いて確認します。WordPressのメニューにこのURLへのリンクを追加すると便利です。

- 記録はそれぞれの端末のブラウザ内に保存されます。PCとスマートフォンで記録は共有されません。
- 更新するときは、同じ手順で `werewolf` フォルダを上書きします。開いている端末は次回起動時に新しい版へ切り替わります。
- 置き場所を変える場合は、`app/vite.config.ts` の `WORDPRESS_BASE` と `app/scripts/make-wordpress-zip.mjs` のフォルダ名を変更してからビルドします。

## ディレクトリ構成

- `app/` — Reactアプリ本体
- `input/` — 仕様検討・引き継ぎ資料（日本語）
