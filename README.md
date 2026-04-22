# pckk-tools-portal

`dev` / `prod` 分離運用を前提に、まず `dev` (Supabase Cloud) を使って進める土台を置いています。

## 仕様書

- 正規仕様書: `docs/specification.md`

## 初期セットアップ（dev）

1. Supabase Cloud で `pckk-tools-portal-dev` プロジェクトを作成
2. CLI 認証と project link
   - `supabase login`
   - `supabase link --project-ref <DEV_PROJECT_REF>`
3. migration 適用
   - `supabase db push`
4. dev seed 適用
   - `supabase db execute --file supabase/seed_dev.sql`
5. Edge Function 用環境変数を作成
   - `copy supabase\\functions\\.env.example supabase\\functions\\.env`
   - `supabase\\functions\\.env` の `GITHUB_APP_PRIVATE_KEY` を埋める
6. Functions secrets 設定と deploy
   - `supabase secrets set --env-file supabase/functions/.env --project-ref <DEV_PROJECT_REF>`
   - `supabase functions deploy github-release-download --project-ref <DEV_PROJECT_REF>`

## 含まれる実装

- Schema: `supabase/migrations/0001_init.sql`
- RLS: `supabase/migrations/0002_rls.sql`
- Auth trigger: `supabase/migrations/0003_profiles_trigger.sql`
- Sync / Admin extension: `supabase/migrations/0004_release_sync_and_admin.sql`
- Seed: `supabase/seed_dev.sql`
- Edge Function: `supabase/functions/github-release-download/index.ts`
- Edge Function: `supabase/functions/github-release-sync/index.ts`

## Frontend (apps/web)

1. `apps/web/.env.local` を作成
   - `NEXT_PUBLIC_SUPABASE_URL=<your project url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>`
2. 依存インストール
   - `cd apps/web`
   - `npm install`
3. 起動
   - `npm run dev`
4. ブラウザで `http://localhost:3000` を開く

## Git Branch Flow

- `main`: 本番反映用ブランチ（Vercel Production）
- `dev`: 日常開発用ブランチ
- 開発手順:
  1. `dev` で作業して push
  2. `dev -> main` の Pull Request を作成
  3. Vercel Preview で確認
  4. 問題なければ `main` にマージ
