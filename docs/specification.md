# pckk-tools-portal 仕様書

更新日: 2026-04-22  
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
- `github-release-sync` Edge Function 実装済み（手動同期 + cron同期起点）
- `github-repository-admin` Edge Function 実装済み（GitHub Appが参照可能なリポジトリ一覧取得、管理対象追加）
- Frontend のログイン / 一覧 / ダウンロード導線実装済み
- 管理者向けの最小管理UI 実装済み（GitHubリポジトリ追加、同期実行、同期状態表示、ツール有効/無効）
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
- GitHub Appが参照可能なリポジトリは、管理者画面から一覧取得して `tools` / `tool_repositories` に登録する
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

- 複数 GitHub Organization 対応方針
- Release 同期方式の拡張（webhook導入、履歴同期範囲）
- 管理画面要件の拡張（編集、削除、失敗再試行、監視）
- 権限モデル（一般ユーザー / 管理者）

---

## 9. 変更履歴

- 2026-04-22: 既存2ドキュメントを統合し、本仕様書へ一本化
