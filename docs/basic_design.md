# pckk-tools-portal 基本設計書

更新日: 2026-04-24  
関連仕様: `docs/specification.md`

---

## 1. 目的

本書は `pckk-tools-portal` の実装方針を定義する。  
仕様書で定義した要件を、開発・運用可能な設計に落とし込むことを目的とする。

---

## 2. システム全体構成

- Frontend: Next.js (`apps/web`)
- Hosting: Vercel
- Auth / DB / Functions: Supabase
- Release Source: GitHub (GitHub App)

処理の流れ（ダウンロード）:

1. ユーザーが Frontend でログイン
2. Frontend が Supabase DB からツール/asset情報を取得
3. Frontend が `github-release-download` を呼び出す
4. Edge Function が GitHub App JWT を生成し installation token を取得
5. GitHub Release Asset を取得してユーザーへ返却
6. `download_logs` に結果を記録

---

## 3. コンポーネント設計

### 3-1. Frontend (`apps/web`)

- 役割:
  - ログインUI
  - ツール/バージョン/asset一覧表示
  - ダウンロード要求発行
- 取得データ:
  - `tools`, `tool_versions`, `tool_assets`
- 呼び出し先:
  - Supabase Data API
  - Supabase Edge Function (`github-release-download`)

### 3-2. Supabase Database

- 役割:
  - 配布対象メタデータ管理
  - ダウンロード監査ログ
- セキュリティ:
  - RLS有効
  - 認証済みユーザーのみ閲覧可能なポリシー適用

### 3-3. Supabase Edge Function

- 関数名:
  - `github-release-download`
  - `github-release-sync`
  - `github-repository-admin`
- 役割:
  - `github-release-download`: tool_asset_id から GitHub asset を解決し、GitHub App 経由で取得して返却する
  - `github-release-sync`: 登録済みリポジトリの latest release を取得し、version / asset 情報を同期する
  - `github-repository-admin`: GitHub Appが参照可能なリポジトリ一覧を取得し、管理者操作で `tools` / `tool_repositories` に登録する
- 補足:
  - CORS preflight (`OPTIONS`) 対応
  - `verify_jwt=false`（関数内認証を採用）

### 3-4. GitHub App

- 役割:
  - private repo Release / Asset への安全アクセス
- 想定権限:
  - `Contents: Read-only`
- 管理単位:
  - `org/repo` ごとに installation を持つ
- リポジトリ一覧:
  - GitHub App JWT で `/app/installations` を呼び出す
  - 取得した全installationに対して installation token を発行する
  - installation token で `/installation/repositories` を呼び出す
  - 取得した一覧は管理者画面でorg/user単位に表示し、未登録リポジトリのみ追加対象にする

---

## 4. データ設計（現行）

主要テーブル:

- `profiles`: ユーザープロファイル
- `tools`: ツールの論理エントリ
- `tool_repositories`: tool と GitHub repo の対応
- `tool_versions`: release単位情報
- `tool_assets`: 配布ファイル情報
- `download_logs`: ダウンロード結果ログ

設計方針:

- スキーマ変更は migration で履歴化
- dev seed は `supabase/seed_dev.sql` を正本化
- 直接SQL変更は検証用途に限定

---

## 5. 同期設計（実装済み）

目的:

- `tool_versions` / `tool_assets` の手動更新を廃止する

現行実装:

1. 認証ユーザーログイン時の自動同期（10分クールダウン）
2. 手動同期API（管理者UIから実行可能）
3. 最新および過去リリース履歴の一括同期（直近最大100件）

今後の拡張:

1. webhook同期（release published）

同期対象:

- `tool_repositories.sync_enabled = true` の `github_owner/github_repo`
- 対象releaseは最新リリースおよび過去リリース（直近最大100件）

履歴同期アルゴリズム:

1. GitHub API `GET /repos/{owner}/{repo}/releases?per_page=100` を呼び出し。
2. 取得したリリースをループ処理し、ドラフト（`draft: true`）以外のリリースについて、`tool_versions` および `tool_assets` への upsert 処理を一括実行。
3. `tool_repositories.last_release_tag` には、`prerelease` が `false` かつ `draft` が `false` であるもののうち最新（リストの中で最初に該当するもの）のタグを書き込む。プレリリース版しか存在しない場合は、取得した配列の最初のタグを使用する。

失敗時:

- repo単位で失敗を分離
- エラー内容をログ化し、他repoの同期は継続

実装補足:

- 同期実行履歴は `sync_runs` テーブルへ記録
- repo単位の最新同期状態は `tool_repositories.last_*` 列へ記録
- 直近10分以内に `sync_runs` が存在する場合は `skipped_recent` を返して処理を抑止


---

## 6. 管理画面設計

目的:

- DB直接操作なしで配布対象リポジトリを追加できるようにする

現行実装:

1. 管理者がログインする
2. Frontend が `github-repository-admin` の `GET` を呼び出す
3. Edge Function がGitHub Appの全installationを取得する
4. Edge Function が各installationから参照可能リポジトリ一覧を取得する
5. Frontend が登録済み/未登録を表示する
6. 管理者が未登録リポジトリを選び、表示名・slug・説明を入力して追加する
7. Edge Function が `tools` と `tool_repositories` を作成する
8. 管理者が `tools` の表示名・slug・説明を編集する
9. 管理者が不要な `tools` を削除する（関連repo/version/assetはFK連鎖で削除）
10. 管理者が `github-release-sync` を実行して release / asset を同期する

セキュリティ:

- 管理者判定は `profiles.is_admin = true` で行う
- GitHub App秘密鍵、installation token、service role key はEdge Function内だけで扱う
- ブラウザから直接GitHub APIへアクセスしない

---

## 7. ブランチ / デプロイ設計

- `dev`: 開発用
- `main`: 本番反映用

運用:

1. `dev` で実装
2. `dev -> main` PR 作成
3. Vercel Preview で確認
4. `main` マージで Production 反映

Supabase:

- `dev` で検証後 `prod` へ反映
- Function/Schema変更は必ず Git 管理

---

## 8. 非機能設計

### 8-1. 可用性

- 一覧表示は DB 参照中心で応答を安定化
- 配布時のみ GitHub API に依存

### 8-2. セキュリティ

- GitHub installation token をクライアントへ渡さない
- Secret は Supabase Dashboard で管理
- private key は Git 管理対象外

### 8-3. 監査

- `download_logs` に成功/失敗を記録
- 障害時は Supabase Edge Function logs と突合

---

## 9. 今後の設計確定事項

- 複数Organization対応時の管理モデル
  - 単一GitHub App運用か、org別App許容か
- 管理者権限モデル
  - 同期実行可能ユーザーの定義
- 同期ジョブの高度化
  - リトライ制御
  - webhook併用時の重複制御

---

## 10. UI画面設計（2026-04-24 追加）

### 10-1. 対象

- `apps/web/app/page.tsx`
- `apps/web/components/portal/*`

### 10-2. コンポーネント分割

- `PortalHeader`: タイトル、ユーザー情報、role、再読み込み、ログアウト
- `PortalHero`: 説明文と背景パターン
- `PortalStats`: 4つのステータスカード表示
- `ToolSearchFilters`: 検索/カテゴリ/条件フィルタ/リセット
- `ToolCard`: ツール単位カード表示（最新版中心）
- `AssetBadge`: asset用途ラベル
- `AssetDownloadButton`: ダウンロードCTA（最新版導線を強調）
- `VersionAccordion`: 旧バージョン表示
- `ManagementInfoDisclosure`: 内部管理情報表示
- `EmptyState`: 該当データなし表示

### 10-3. 表示用データ整形

フロントでは生の `tools/tool_versions/tool_assets` を直接描画せず、表示用モデルへ整形する。

- `DisplayTool`
  - `latestVersion` と `oldVersions` を分離
  - `recommendedAsset` を保持
  - `documentAsset` / `otherAssets` を保持
- `DisplayVersion`
  - `assets` を分類結果つきで保持
- `DisplayAsset`
  - `kind`（app/document/python/support/other）を保持

### 10-4. asset分類と推奨選定

- `getAssetKind(fileName)` で拡張子・名称から用途分類する
- `getRecommendedAsset(assets)` で優先度順に推奨assetを選定する
  - 優先順: app > document > python > support > other

### 10-5. 情報表示ポリシー

- 通常ユーザーの初期表示:
  - ツール名、概要、対象業務、最新版、推奨asset、最新版ダウンロード
- 折りたたみ表示:
  - 旧バージョン
  - その他ファイル
  - 管理情報（ID群、GitHub release id、size、published_at）

### 10-6. フィルタ設計

- キーワード検索対象:
  - `display_name`, `slug`, `description`, `category`, `targetWork`
- 条件:
  - 最新版のみ（初期ON）
  - ドキュメントあり
  - インストーラーあり

### 10-7. レイアウト/スタイル

- PC: 2-3カラムカード
- タブレット/モバイル: 1カラム
- カラートークン:
  - `pckk-blue #0A3161` (パシフィックブルー / ディープアースブルー)
  - `pckk-earth #0E3E7D` (アースブルー)
  - `teal #0F766E` (ダウンロードCTA用)
  - `platinum-bg #F1F5F9` (プラチナシルバー背景)
  - `surface #FFFFFF`
  - `border-platinum #E2E8F0` (プラチナグレー境界線)
  - `charcoal-text #1E293B` (無彩色のチャコールテキスト)
  - `muted-text #64748B`
- ページ背景に精密な方眼線（プレシジョングリッド）を設定。
- ヒーローエリアの背景に、パシフィックコンサルタンツのロゴマークをモチーフにした「重なり合うスクエア（正方形）」の幾何学パターン（SVG）を重ね、透過して奥行きを出す。

### 10-8. Stitchデザインシステム反映方針（2026-04-24 追記、2026-05-20 改定）

- 参照元:
  - Stitch projectId: `1948335383852346385`
  - Design System: `Pacific Infrastructure Portal`
- 反映要素:
  - 見出しフォント: `Public Sans`
  - 本文フォント: `Inter`
  - Primary: Navy (`#0A3161`)
  - Download CTA: Teal（標準ボタンより高い視認性）
  - Card: 白背景 + 1px border-platinum + shadowなし (角丸はシャープな6px〜8px)
  - Card Hover: カードがスムーズに浮き上がり、ボーダーがパシフィックブルーに変化。ホバー時に「重なり合うもうひとつのスクエア」を想起させる二重枠線の光彩効果を適用。
- 情報構造:
  - 補助情報領域は 1 回の展開で `その他ファイル / 旧バージョン / 管理情報` を確認できる構成にする
  - 旧バージョン表示の入れ子折りたたみは採用しない


---

## 11. 変更管理

- 設計変更は本書更新を先行する
- 実装PRでは本書と仕様書の差分整合を確認する

### 11-1. 実務フロー（追加方針）

1. 仕様書に追加方針を記載する
2. 基本設計書に設計差分を記載する
3. 実装PRでコード変更とドキュメント差分を同時に提出する
4. 実装完了後に仕様書の状態を更新する
