# pckk-tools-portal 構築手順書

更新日: 2026-04-21  
対象: Yuta / AIエージェント併用で手を動かして構築するための初期手順

---

## 0. 現在の状況

現時点の進捗は以下とする。

- GitHub App 名: `pckk-tools-portal`
- GitHub App の秘密鍵を発行済み
  - 例: `pckk-tools-portal.2026-04-20.private-ke.pem`
- GitHub App を `Pckk-iRIC` organization にインストール済み
- 疎通確認済み repo:
  - `Pckk-iRIC/iRIC-Input-Checker`
- 確認済み値:
  - `App ID`: `3450394`
  - `installation_id`: `125744521`

この手順書では、以下の順で進める。

1. GitHub App の設定内容を確認し、API 疎通を取る
2. Supabase プロジェクトを作成し、DB と Auth の土台を作る
3. Supabase Edge Function から GitHub App を使って private Release Asset を取得する
4. その後に Next.js フロントをつなぐ
5. Vercel を追加し、Preview/Production 運用でフロント開発を回しやすくする

---

## 1. この段階での最終ゴール

まず最小構成として、以下が通れば成功とする。

- 社内ユーザーが Supabase Auth でログインできる
- ポータル画面でツール一覧を見られる
- 任意のツールの Release Asset を private repo からダウンロードできる
- ダウンロードログが DB に残る

この段階では、まだ以下は後回しにする。

- 共通インストーラーの本格実装
- 自動アップデート
- 部門単位の複雑な権限制御
- リリース情報の自動同期
- 本番監査・通知・分析基盤

---

## 2. 推奨アーキテクチャ

```text
[User Browser]
    |
    v
[Vercel (Next.js Frontend)]
    |
    v
[Supabase Auth]
    |
    v
[Supabase Edge Functions] -----> [Supabase Postgres]
    |
    v
[GitHub App]
    |
    v
[Private Repositories / GitHub Releases / Assets]
```

役割分担は次のとおり。

- **GitHub App**
  - private repo の Release / Release Asset に安全にアクセスする
- **Supabase Auth**
  - 社内ユーザーのログイン管理
- **Supabase Postgres**
  - ツール情報、バージョン、アセット、ダウンロードログを管理
- **Supabase Edge Functions**
  - GitHub App の JWT を生成し、installation token を発行して GitHub API を呼ぶ
- **Next.js**
  - ポータルの画面
- **Vercel**
  - Next.js の Preview/Production デプロイ
  - PR ごとの確認環境を自動作成し、フロント実装の確認を高速化

---

## 3. リポジトリ構成方針

最初は以下の構成を推奨する。

```text
your-org/
├─ pckk-tools-portal/
│  ├─ apps/
│  │  └─ web/
│  ├─ supabase/
│  │  ├─ functions/
│  │  │  └─ github-release-download/
│  │  │     └─ index.ts
│  │  ├─ migrations/
│  │  └─ config.toml
│  ├─ packages/
│  │  ├─ ui/
│  │  └─ shared/
│  ├─ .env.example
│  ├─ package.json
│  └─ README.md
│
├─ tool-a/
│  ├─ src/
│  ├─ .github/workflows/release.yml
│  ├─ CHANGELOG.md
│  └─ README.md
│
├─ tool-b/
│  └─ ...
│
└─ tool-c/
   └─ ...
```

### 方針

- **各ツール本体 repo は分ける**
  - バージョン、依存関係、ビルド方法、リリースノートが別だから
- **ポータルは 1 repo に集約する**
  - フロント、Edge Functions、DB migration を同時に進めやすい
- **共通インストーラー専用 repo は最初は作らない**
  - まずは各ツール repo の Release Asset を配るだけで十分

---

## 4. セキュリティ上の注意

### 4-1. GitHub App 秘密鍵 `.pem`

`pckk-tools-portal.2026-04-20.private-ke.pem` は **絶対に Git にコミットしない**。

やること:

- ローカルの安全な場所に置く
- repo の外に置く
- `.gitignore` に以下を追加する

```gitignore
*.pem
.env
.env.*
.supabase/
```

### 4-2. 秘密情報の置き場

ローカル開発時:

- `.env` またはローカルの secret 管理

本番時:

- Supabase Edge Functions secrets

### 4-3. installation token をクライアントに渡さない

GitHub App の installation token は Edge Function の中だけで使う。

- フロントに渡さない
- インストーラーに埋め込まない
- ログに出さない

---

# 5. フェーズ1: GitHub App の確認

このフェーズの目的は、**作成済み GitHub App で private repo の Release 情報を取得できることを確認する**こと。

---

## 5-1. GitHub App の設定確認

GitHub App 設定画面で以下を確認する。

### 必須項目

- App 名: `pckk-tools-portal`
- 所有: `Pckk-iRIC` org 側
- Installation 済み
- 対象 repo が選択されている

### Repository permissions

最初は以下だけでよい。

- **Contents: Read-only**

今の用途では Release / Asset の取得が主目的なので、まずはここから始める。

### Repository access

- 可能なら **Only select repositories** で必要 repo のみに絞る

---

## 5-2. App ID を控える

GitHub App の設定画面から以下を控える。

- `App ID`
- 必要なら `Client ID`

この時点では最低限 `App ID` があればよい。

---

## 5-3. installation ID を取得する

方法はいくつかあるが、最初は API で取得する。

取得対象 repo を 1 つ決める。

例:

- owner: `Pckk-iRIC`
- repo: `tool-a`

installation ID は後で token 発行に使う。

---

## 5-4. ローカルで GitHub App JWT を作る

Python で試すのが簡単。

### 事前準備

```bash
pip install pyjwt cryptography requests
```

### `scripts/test_github_app.py`

```python
from pathlib import Path
import time
import jwt
import requests

APP_ID = "YOUR_APP_ID"
PEM_PATH = Path(r"C:\path\to\pckk-tools-portal.2026-04-20.private-ke.pem")
OWNER = "Pckk-iRIC"
REPO = "tool-a"
API_VERSION = "2026-03-10"

private_key = PEM_PATH.read_text(encoding="utf-8")

now = int(time.time())
payload = {
    "iat": now - 60,
    "exp": now + 540,
    "iss": APP_ID,
}

app_jwt = jwt.encode(payload, private_key, algorithm="RS256")
headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {app_jwt}",
    "X-GitHub-Api-Version": API_VERSION,
}

# 1) repository installation を取得
res = requests.get(
    f"https://api.github.com/repos/{OWNER}/{REPO}/installation",
    headers=headers,
)
res.raise_for_status()
installation = res.json()
installation_id = installation["id"]
print("installation_id=", installation_id)

# 2) installation access token を作成
res = requests.post(
    f"https://api.github.com/app/installations/{installation_id}/access_tokens",
    headers=headers,
    json={
        "repositories": [REPO],
        "permissions": {
            "contents": "read",
        },
    },
)
res.raise_for_status()
access_token = res.json()["token"]
print("token acquired")

# 3) latest release を取得
inst_headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {access_token}",
    "X-GitHub-Api-Version": API_VERSION,
}
res = requests.get(
    f"https://api.github.com/repos/{OWNER}/{REPO}/releases/latest",
    headers=inst_headers,
)
res.raise_for_status()
release = res.json()
print("latest tag:", release["tag_name"])
print("release id:", release["id"])

# 4) asset 一覧を表示
for asset in release.get("assets", []):
    print(asset["id"], asset["name"], asset.get("size"))
```

### 成功条件

以下が通ればよい。

- installation ID が取得できる
- installation access token が取得できる
- latest release が取れる
- assets が列挙できる

---

## 5-5. asset 本体を取るテスト

asset ID が分かったら、以下のように追加確認する。

```python
ASSET_ID = 123456789
OUT_PATH = Path("downloaded_asset.bin")

res = requests.get(
    f"https://api.github.com/repos/{OWNER}/{REPO}/releases/assets/{ASSET_ID}",
    headers={
        "Accept": "application/octet-stream",
        "Authorization": f"Bearer {access_token}",
        "X-GitHub-Api-Version": API_VERSION,
    },
    allow_redirects=True,
    stream=True,
)
res.raise_for_status()

with OUT_PATH.open("wb") as f:
    for chunk in res.iter_content(chunk_size=8192):
        if chunk:
            f.write(chunk)

print("downloaded:", OUT_PATH)
```

### この段階での確認ポイント

- private repo の asset を実際に保存できるか
- 権限不足エラーがないか
- 対象 repo が App に含まれているか

---

## 5-6. このフェーズの完了条件

以下が満たされれば Phase 1 完了。

- GitHub App の App ID が分かっている
- installation ID が取得できている
- installation token を作れる
- private Release Asset をローカルへ保存できる

---

# 6. フェーズ2: Supabase プロジェクト作成

このフェーズの目的は、**ポータルの認証基盤と管理 DB を作ること**。

---

## 6-1. Supabase プロジェクトを作る

Supabase で新規プロジェクトを作成する。

推奨プロジェクト名例:

- `pckk-tools-portal-dev`
- `pckk-tools-portal-prod`

最初は `-dev` でよい。

### dev/prod 運用ルール

- `dev`: 開発・検証用。スキーマ変更、RLS、Function の試験はここで行う
- `prod`: 本番用。`main` 反映済みの変更だけを適用する
- 原則として、先に `dev` で動作確認してから `prod` へ反映する

---

## 6-2. ローカル作業ディレクトリを作る

```bash
mkdir pckk-tools-portal
cd pckk-tools-portal
supabase init
```

必要なら monorepo にする前でもよい。最初は Supabase だけ動けばよい。

Docker が使えない環境では、`supabase start` は使わず Supabase Cloud の `dev` / `prod` へ直接 `link` して進める。

---

## 6-3. Auth 設定

最初は単純に email/password で開始する。

やること:

- Email 認証を有効化
- テスト用ユーザーを 1 人作成

この段階では SSO や Google login は不要。

---

## 6-4. DB テーブルを作る

### 目的

最低限、以下を管理したい。

- ユーザー
- ツール一覧
- ツールと GitHub repo の対応
- バージョン
- Asset
- ダウンロードログ

### SQL: 初期スキーマ

`supabase/migrations/0001_init.sql`

```sql
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  department_code text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tool_repositories (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  github_owner text not null,
  github_repo text not null,
  github_installation_id bigint not null,
  default_asset_pattern text,
  release_channel text not null default 'stable',
  created_at timestamptz not null default now(),
  unique (github_owner, github_repo)
);

create table public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  version_tag text not null,
  release_name text,
  github_release_id bigint not null,
  published_at timestamptz,
  release_notes text,
  created_at timestamptz not null default now(),
  unique (tool_id, version_tag)
);

create table public.tool_assets (
  id uuid primary key default gen_random_uuid(),
  tool_version_id uuid not null references public.tool_versions(id) on delete cascade,
  github_asset_id bigint not null unique,
  asset_name text not null,
  content_type text,
  size_bytes bigint,
  os text,
  arch text,
  installer_kind text,
  sha256 text,
  created_at timestamptz not null default now()
);

create table public.download_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  tool_id uuid references public.tools(id) on delete set null,
  tool_version_id uuid references public.tool_versions(id) on delete set null,
  tool_asset_id uuid references public.tool_assets(id) on delete set null,
  status text not null,
  error_message text,
  user_agent text,
  requested_at timestamptz not null default now()
);
```

---

## 6-5. RLS を有効化する

`supabase/migrations/0002_rls.sql`

```sql
alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.tool_repositories enable row level security;
alter table public.tool_versions enable row level security;
alter table public.tool_assets enable row level security;
alter table public.download_logs enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

create policy "tools_read_authenticated"
on public.tools
for select
to authenticated
using (true);

create policy "tool_repositories_read_authenticated"
on public.tool_repositories
for select
to authenticated
using (true);

create policy "tool_versions_read_authenticated"
on public.tool_versions
for select
to authenticated
using (true);

create policy "tool_assets_read_authenticated"
on public.tool_assets
for select
to authenticated
using (true);

create policy "download_logs_read_own"
on public.download_logs
for select
to authenticated
using (auth.uid() = user_id);
```

---

## 6-6. profiles 自動作成 trigger

`supabase/migrations/0003_profiles_trigger.sql`

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

## 6-7. 初期データを入れる

まずは手で 1 件だけ入れてよい。

```sql
insert into public.tools (slug, display_name, description)
values ('iric-input-checker', 'iRIC Input Checker', 'テスト用ツール');
```

GitHub 側の repo 情報と installation ID は、Phase 1 で確認した値を入れる。

```sql
insert into public.tool_repositories (
  tool_id,
  github_owner,
  github_repo,
  github_installation_id,
  default_asset_pattern,
  release_channel
)
select
  t.id,
  'Pckk-iRIC',
  'iRIC-Input-Checker',
  125744521,
  '*',
  'stable'
from public.tools t
where t.slug = 'iric-input-checker';

または、この repo では以下をそのまま適用してよい。

```bash
supabase db execute --file supabase/seed_dev.sql
```
```

---

## 6-8. このフェーズの完了条件

- Supabase project が作成済み
- Auth でテストユーザーを作れる
- `profiles` などのテーブルが存在する
- RLS が有効化されている
- ツール 1 件と repo 対応 1 件が登録されている

---

# 7. フェーズ3: Supabase Edge Function で GitHub App を呼ぶ

このフェーズの目的は、**Supabase から private Release Asset を安全に配布できるようにすること**。

---

## 7-1. function を生成する

```bash
supabase functions new github-release-download
```

---

## 7-2. secrets を登録する

### ローカル用 `.env`

`supabase/functions/.env`

```env
GITHUB_APP_ID=3450394
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

### dev/prod secret 反映

```bash
supabase secrets set --env-file supabase/functions/.env --project-ref YOUR_DEV_PROJECT_REF
supabase secrets set --env-file supabase/functions/.env --project-ref YOUR_PROD_PROJECT_REF
```

---

## 7-3. function の責務

この function は次を行う。

1. リクエストユーザーを受ける
2. DB から `tool_asset_id` に紐づく GitHub repo 情報を取る
3. GitHub App JWT を生成する
4. installation token を発行する
5. GitHub API から asset を取得する
6. `download_logs` に書く
7. バイナリを返す

---

## 7-4. 実装例

`supabase/functions/github-release-download/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2"
import * as jose from "npm:jose"

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

async function createGitHubAppJwt() {
  const appId = Deno.env.get("GITHUB_APP_ID")!
  const privateKeyPem = Deno.env.get("GITHUB_APP_PRIVATE_KEY")!

  const privateKey = await jose.importPKCS8(privateKeyPem, "RS256")

  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("9m")
    .setIssuer(appId)
    .sign(privateKey)

  return jwt
}

async function getInstallationToken(installationId: number) {
  const appJwt = await createGitHubAppJwt()

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({
        permissions: {
          contents: "read",
        },
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`Failed to create installation token: ${await res.text()}`)
  }

  return await res.json()
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { tool_asset_id } = await req.json()

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("tool_assets")
      .select("id, asset_name, github_asset_id, tool_version_id")
      .eq("id", tool_asset_id)
      .single()

    if (assetError || !asset) {
      return new Response("Asset not found", { status: 404 })
    }

    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from("tool_versions")
      .select("id, tool_id")
      .eq("id", asset.tool_version_id)
      .single()

    if (versionError || !versionRow) {
      return new Response("Version not found", { status: 404 })
    }

    const { data: repoRow, error: repoError } = await supabaseAdmin
      .from("tool_repositories")
      .select("github_owner, github_repo, github_installation_id")
      .eq("tool_id", versionRow.tool_id)
      .single()

    if (repoError || !repoRow) {
      return new Response("Repository mapping not found", { status: 404 })
    }

    const tokenJson = await getInstallationToken(repoRow.github_installation_id)
    const installationToken = tokenJson.token

    const ghRes = await fetch(
      `https://api.github.com/repos/${repoRow.github_owner}/${repoRow.github_repo}/releases/assets/${asset.github_asset_id}`,
      {
        headers: {
          "Accept": "application/octet-stream",
          "Authorization": `Bearer ${installationToken}`,
          "X-GitHub-Api-Version": "2026-03-10",
        },
        redirect: "follow",
      },
    )

    if (!ghRes.ok) {
      const body = await ghRes.text()
      await supabaseAdmin.from("download_logs").insert({
        tool_asset_id,
        tool_version_id: asset.tool_version_id,
        tool_id: versionRow.tool_id,
        status: "error",
        error_message: body,
        user_agent: req.headers.get("user-agent"),
      })
      return new Response("GitHub download failed", { status: 502 })
    }

    await supabaseAdmin.from("download_logs").insert({
      tool_asset_id,
      tool_version_id: asset.tool_version_id,
      tool_id: versionRow.tool_id,
      status: "success",
      user_agent: req.headers.get("user-agent"),
    })

    return new Response(ghRes.body, {
      status: 200,
      headers: {
        "Content-Type": ghRes.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.asset_name}"`,
      },
    })
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
```

---

## 7-5. JWT 検証の扱い

この function は **ログイン済みユーザー専用** にするので、`verify_jwt = false` にはしない。

つまりデフォルトのままでよい。

`supabase/config.toml` に明示的な設定は不要。

---

## 7-6. dev プロジェクトへ適用（Docker なし）

```bash
supabase login
supabase link --project-ref YOUR_DEV_PROJECT_REF
supabase db push
supabase db execute --file supabase/seed_dev.sql
supabase secrets set --env-file supabase/functions/.env --project-ref YOUR_DEV_PROJECT_REF
supabase functions deploy github-release-download --project-ref YOUR_DEV_PROJECT_REF
```

---

## 7-7. テスト方法

### 事前条件

- `tool_assets` に 1 件入っている
- その asset は GitHub 上に存在する
- GitHub installation ID が正しい

### テスト呼び出し例

ログイン済みの access token を使って、`dev` の function URL を叩く。

```bash
curl -X POST \
  https://YOUR_DEV_PROJECT_REF.supabase.co/functions/v1/github-release-download \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool_asset_id":"YOUR_TOOL_ASSET_UUID"}' \
  --output downloaded.bin
```

### 成功条件

- ファイルが保存される
- `download_logs` に 1 行入る

---

## 7-8. prod へ反映する時

```bash
supabase link --project-ref YOUR_PROD_PROJECT_REF
supabase db push
supabase secrets set --env-file supabase/functions/.env --project-ref YOUR_PROD_PROJECT_REF
supabase functions deploy github-release-download --project-ref YOUR_PROD_PROJECT_REF
```

必要なら API 経由でもよい。

```bash
supabase functions deploy github-release-download --project-ref YOUR_PROD_PROJECT_REF --use-api
```

---

## 7-9. このフェーズの完了条件

- Edge Function が動く
- private asset がダウンロードできる
- download log が記録される

---

# 8. フェーズ4: Next.js + Vercel でフロント開発を回す

ここでは、**ローカル開発と Vercel Preview を併用して UI 実装速度を上げる**ことを目的にする。

---

## 8-1. Vercel プロジェクトを作成する

1. Vercel で GitHub 連携を有効化する
2. ポータル repo (`pckk-tools-portal`) を Import する
3. Root Directory を `apps/web` に設定する（monorepo 前提）

---

## 8-2. 環境変数を設定する

最低限、以下を Vercel の `Preview` と `Production` に設定する。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`（サーバーサイド利用時）
- `SUPABASE_SERVICE_ROLE_KEY`（必要な場合のみ。通常は API/Function 側へ寄せる）

注意:

- `SUPABASE_SERVICE_ROLE_KEY` はクライアントに露出させない
- 基本は Edge Function 経由で安全側に寄せる

---

## 8-3. デプロイ設定の目安

- Framework Preset: `Next.js`
- Build Command: `pnpm build`（使用パッケージマネージャーに合わせる）
- Install Command: `pnpm install --frozen-lockfile`
- Output Directory: 自動（Next.js デフォルト）

---

## 8-4. 開発フロー

1. ローカルで UI 実装 (`pnpm dev`)
2. PR を作成
3. Vercel Preview URL で動作確認
4. 問題なければ `main` マージで Production 反映

この流れにすると、ローカル依存を減らしつつレビューしやすくなる。

---

## 8-5. このフェーズの完了条件

- Vercel で `apps/web` がデプロイできる
- PR ごとに Preview URL が発行される
- Supabase Auth でログインできる
- ツール一覧画面とダウンロード導線が Preview で確認できる

---

# 9. フェーズ5: 次にやること

ここまでできたら、次に進む。

### 優先順

1. Next.js でログイン画面を作る
2. ツール一覧画面を作る
3. バージョン一覧 / asset 一覧を表示する
4. ダウンロードボタンから Edge Function を叩く
5. release 情報の同期バッチを作る
6. ツール別・部門別権限を入れる
7. 共通インストーラーや共通ランチャーを検討する

---

# 10. AIエージェントへの依頼テンプレート

## 10-1. GitHub App 疎通確認を依頼する時

```text
このリポジトリで GitHub App 疎通確認用の Python スクリプトを作ってください。
要件:
- .pem は環境変数またはローカルパスで指定できる
- GitHub App JWT を生成する
- GET /repos/{owner}/{repo}/installation で installation ID を取得する
- POST /app/installations/{installation_id}/access_tokens で installation token を取得する
- GET /repos/{owner}/{repo}/releases/latest を取得する
- asset 一覧を表示する
- エラーハンドリングを入れる
- README に実行手順を書く
```

## 10-2. Supabase migration を依頼する時

```text
Supabase 用 migration SQL を作成してください。
要件:
- public.profiles, tools, tool_repositories, tool_versions, tool_assets, download_logs を作成する
- auth.users を profiles.id の外部キーに使う
- on delete cascade / set null を適切に設定する
- RLS を有効にする
- authenticated ユーザーが tools と assets を読める policy を作る
- signup 時に profiles を自動作成する trigger も作る
```

## 10-3. Edge Function 実装を依頼する時

```text
Supabase Edge Function github-release-download を実装してください。
要件:
- POST のみ受け付ける
- Authorization ヘッダ必須
- 入力は { tool_asset_id: string }
- DB から asset -> version -> repository を引く
- GitHub App JWT を生成する
- installation access token を取得する
- GitHub release asset を application/octet-stream で取得する
- download_logs に success/error を記録する
- バイナリレスポンスを返す
- TypeScript で型を付ける
- エラーハンドリングを入れる
```

---

# 11. 最低限のチェックリスト

## GitHub App

- [ ] `pckk-tools-portal` App ID を控えた
- [ ] `.pem` を repo 外に保存した
- [ ] `.gitignore` に `*.pem` を追加した
- [ ] `Pckk-iRIC` org にインストールされている
- [ ] 対象 repo が選択されている
- [ ] `Contents: Read-only` が付いている
- [ ] installation ID を取得できた
- [ ] latest release を API 取得できた
- [ ] asset 本体を取得できた

## Supabase

- [ ] `pckk-tools-portal-dev` project を作成した
- [ ] `pckk-tools-portal-prod` project を作成した
- [ ] Auth のテストユーザーを作成した
- [ ] migration を適用した
- [ ] RLS を有効化した
- [ ] 初期データを登録した

## Edge Function

- [ ] function を生成した
- [ ] secrets を登録した
- [ ] dev へ deploy した
- [ ] asset ダウンロードに成功した
- [ ] download_logs が記録された

## Vercel / Frontend

- [ ] Vercel に repo を Import した
- [ ] Root Directory を `apps/web` に設定した
- [ ] Preview/Production の環境変数を設定した
- [ ] PR で Preview URL が発行される
- [ ] Preview でログインとダウンロード導線を確認した

---

# 12. ここまで終わった後の次の一手

次は以下のどちらかに進む。

### パターンA: フロントを先に作る

- Next.js ログイン画面
- ツール一覧
- ダウンロードボタン

### パターンB: バックエンドを強化する

- GitHub Releases 同期バッチ
- SHA256 管理
- 部門別ツール表示
- 管理者画面

最初は **A を先にやる**のがよい。画面から落とせるところまで先に通した方が、全体が見えやすい。

---

# 13. 今すぐやるべき最小タスク

今日やるタスクはこれだけでよい。

1. GitHub App の App ID を控える
2. `.pem` を安全な場所へ移動する
3. Python スクリプトで installation ID を取る
4. latest release と asset 一覧を取得する
5. asset を 1 つダウンロードする
6. Supabase project を作る
7. migration を流す
8. Edge Function の雛形を作る
9. Vercel に `apps/web` を接続して Preview URL を出す

この 9 個が終われば、フロント実装とレビューを同時に回せる。
