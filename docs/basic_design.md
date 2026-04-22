# pckk-tools-portal 基本設計書

更新日: 2026-04-22  
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

- 関数名: `github-release-download`
- 役割:
  - 認証トークン検証（関数内）
  - tool_asset_id から GitHub asset 解決
  - GitHub App 経由で asset 取得
  - ログ記録
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

## 5. 同期設計（これから実装）

目的:

- `tool_versions` / `tool_assets` の手動更新を廃止する

段階的方針:

1. 手動同期API（管理者実行）
2. 定期同期（例: 15分）
3. webhook同期（release published）

同期対象:

- `tool_repositories` に登録済みの `github_owner/github_repo`
- `release_channel` に応じた対象release

失敗時:

- repo単位で失敗を分離
- エラー内容をログ化し、他repoの同期は継続

---

## 6. ブランチ / デプロイ設計

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

## 7. 非機能設計

### 7-1. 可用性

- 一覧表示は DB 参照中心で応答を安定化
- 配布時のみ GitHub API に依存

### 7-2. セキュリティ

- GitHub installation token をクライアントへ渡さない
- Secret は Supabase Dashboard で管理
- private key は Git 管理対象外

### 7-3. 監査

- `download_logs` に成功/失敗を記録
- 障害時は Supabase Edge Function logs と突合

---

## 8. 今後の設計確定事項

- 複数Organization対応時の管理モデル
  - 単一GitHub App運用か、org別App許容か
- 管理者権限モデル
  - 同期実行可能ユーザーの定義
- 同期ジョブの実行基盤
  - Supabase Scheduled / 外部CI どちらを採用するか

---

## 9. 変更管理

- 設計変更は本書更新を先行する
- 実装PRでは本書と仕様書の差分整合を確認する

### 9-1. 実務フロー（追加方針）

1. 仕様書に追加方針を記載する
2. 基本設計書に設計差分を記載する
3. 実装PRでコード変更とドキュメント差分を同時に提出する
4. 実装完了後に仕様書の状態を更新する
