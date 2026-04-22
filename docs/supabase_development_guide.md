# Supabase 開発手引き

更新日: 2026-04-22  
対象: `pckk-tools-portal` の Supabase を更新する開発者

---

## 1. 基本方針

- 変更の正本はリポジトリ内 `supabase/` 配下に置く
- 先にファイルを修正してから Supabase に反映する
- 本番に入る変更は必ず migration として履歴化する

---

## 2. 変更内容ごとの修正先

### 2-1. テーブル構造 / RLS / Trigger を変える

- 修正先: `supabase/migrations/*.sql`（新規 migration を追加）
- 例:
  - テーブル追加
  - カラム追加
  - policy 変更
  - trigger/function 変更

### 2-2. 初期データやテストデータを変える

- 修正先: `supabase/seed_dev.sql`
- 例:
  - `tools`
  - `tool_repositories`
  - 検証用 `tool_versions` / `tool_assets`

### 2-3. Edge Function を変える

- 修正先: `supabase/functions/github-release-download/index.ts`
- 反映時は Function の再デプロイが必要

### 2-4. Secret（鍵・トークン）を変える

- 修正先: Supabase Dashboard の Secrets
- `GITHUB_APP_PRIVATE_KEY` などはファイルではなく Dashboard 側で管理する

---

## 3. 実施手順（推奨）

1. 変更を `supabase/` 配下のファイルに反映する
2. dev 環境へ適用する
3. 動作確認する
4. 問題なければ prod へ反映する

---

## 4. MCP で作業するときのルール

- MCP の `execute_sql` で直接変更するのは一時検証だけにする
- 本採用する変更は必ず migration SQL に落とし込む
- 「DB は変わったがファイルが更新されていない」状態を作らない

---

## 5. よく使う確認ポイント

- migration が適用済みか
- `github-release-download` のデプロイバージョン
- Secrets が正しいか
- `download_logs` に success / error が記録されるか

---

## 6. 最小チェックリスト

- [ ] 変更内容に対応する `supabase/` ファイルを更新した
- [ ] dev へ適用した
- [ ] ダウンロード導線を含めて動作確認した
- [ ] 変更を GitHub にコミットした
- [ ] prod 反映手順を確認した
