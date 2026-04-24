# pckk-tools-portal 仕様書

更新日: 2026-04-24  
ステータス: 正規運用ドキュメント（Single Source of Truth）

関連設計書:

- `docs/basic_design.md`

---

## 1. 文書運用ルール

- 本ファイルを仕様の正本とする
- 仕様変更は Pull Request で本ファイルを更新してから実装する
- 過去の手順書・補助ドキュメントは原則作成しない（必要時は本書に統合）

### 方針追加時のドキュメント管理

- 追加方針は次の3層で管理する
  1. 仕様書（本書）: 何をやるか
  2. 基本設計書（`docs/basic_design.md`）: どう作るか
  3. 実装PR: 何を変えたか
- 実装前に仕様書と基本設計書を先に更新する
- 実装完了後は仕様書の該当項目を「実装済み」へ更新する

---

## 2. 目的

- 社内向けツール配布ポータルを提供する
- private GitHub Release Asset を安全に配布する
- Supabase Auth による認証と配布ログ記録を行う

---

## 3. システム構成

- Frontend: Next.js (`apps/web`)
- Hosting: Vercel
- Backend: Supabase (Postgres / Auth / Edge Functions)
- External: GitHub App (Release / Asset access)

---

## 4. 現在の実装範囲

- Supabase schema / RLS / trigger 実装済み
- `github-release-download` Edge Function 実装済み
- `github-release-sync` Edge Function 実装済み（認証ユーザーの自動同期起点 + 手動同期）
- `github-repository-admin` Edge Function 実装済み（GitHub Appが参照可能なリポジトリ一覧取得、管理対象追加）
- Frontend のログイン / 一覧 / ダウンロード導線実装済み
- 管理者向けの最小管理UI 実装済み（GitHubリポジトリ追加、同期実行、同期状態表示、ツール編集/削除）
- ユーザー画面ログイン時に自動同期を試行（直近10分以内の同期があればスキップ）
- `dev` / `main` ブランチ運用開始済み

---

## 5. データモデル方針

主要テーブル:

- `tools`
- `tool_repositories`
- `tool_versions`
- `tool_assets`
- `download_logs`
- `profiles`

基本方針:

- 変更は migration で管理
- seed は `supabase/seed_dev.sql` を正本とする
- 手動 SQL は検証用途のみ（本採用時は migration へ反映）
- GitHub Appがインストール済みの全org/userから参照可能リポジトリを一覧取得し、管理者画面から `tools` / `tool_repositories` に登録する
- GitHub App秘密鍵、installation token、service role key はブラウザへ渡さない

---

## 6. 運用方針（開発）

- 開発ブランチ: `dev`
- 本番反映ブランチ: `main`
- `dev -> main` の PR で Vercel Preview を確認してからマージ

---

## 7. 運用方針（Supabase）

- 原則 `dev` で検証後に `prod` 反映
- Edge Function secret は Supabase Dashboard で管理
- 配布失敗時は `download_logs` と Edge Function logs で原因追跡

---

## 8. 今後の仕様確定項目

- 複数 GitHub Organization 対応方針（GitHub Appの全installation一覧取得は実装済み）
- Release 同期方式の拡張（webhook導入、履歴同期範囲）
- 管理画面要件の拡張（編集、削除、失敗再試行、監視）
- 権限モデル（一般ユーザー / 管理者）

---

## 9. UI刷新仕様（2026-04-24 追加）

対象:

- ログイン後メイン画面（`apps/web`）

目的:

- 社内向け業務ポータルとして、必要ツールを安全・迅速に取得できる導線へ改善する
- GitHub release asset の生データ表示を抑え、利用者視点の情報優先へ再編する

必須要件:

- 既存機能を維持する
  - ログイン済みユーザー表示
  - role表示
  - ツール一覧取得
  - version一覧取得
  - asset一覧取得
  - asset download
  - reload
  - logout
- 画面上部に業務システム向けヘッダーを配置し、ユーザー情報と操作（再読み込み/ログアウト）を常時表示する
- ヘッダー直下にヒーローエリアを配置し、ポータル目的説明を表示する
- ステータスカード（公開中ツール数、最新版数、配布ファイル数、最終更新日時）を表示する
- ツール一覧前に検索・フィルタを配置する
  - キーワード検索（ツール名/概要/カテゴリ）
  - カテゴリ絞り込み
  - 最新版のみ
  - ドキュメントあり
  - インストーラーあり
  - フィルタリセット
- ツールはカード形式表示とし、通常表示は最新版中心とする
- 「最新版をダウンロード」をカード内の最優先CTAにする
- 旧バージョン、その他ファイル、内部IDは折りたたみ表示（初期は閉じる）とする
- assetは用途分類して表示する（アプリ本体 / ドキュメント / Python package / 補助ファイル / その他）
- 内部ID（tool_id, version_id, asset_id, github_release_id 等）は管理情報として分離表示する
- レスポンシブ対応を行う（PC 2-3カラム、タブレット以下1カラム）

デザイン要件:

- 背景は白または薄いグレー
- メインカラーは濃紺、アクセントは青/青緑
- 境界線は薄いブルーグレー
- ヒーロー背景に地形図/等高線/GISメッシュを連想させる控えめな抽象パターンを置く
- 派手さより可読性と安定感を優先する

デザインシステム準拠（2026-04-24 追記）:

- Stitch プロジェクト `1948335383852346385` の `Pacific Infrastructure Portal` を参照する
- タイポグラフィは見出し `Public Sans`、本文 `Inter` を基本とする
- ツールカードは「白背景 + 1px ボーダー + 低装飾（影なし）」を基本とする
- 「最新版をダウンロード」は Teal 系の最優先CTAとして視認性を確保する
- 旧バージョン表示は二重折りたたみを避け、1回の展開で確認可能にする

---

## 10. 変更履歴

- 2026-04-22: 既存2ドキュメントを統合し、本仕様書へ一本化
- 2026-04-24: ログイン後メイン画面のUI刷新仕様を追加（ヘッダー/ヒーロー/ステータス/検索フィルタ/カード/折りたたみ）
- 2026-04-24: Stitchデザインシステム準拠要件（タイポ/CTA/カード/折りたたみ）を追記
