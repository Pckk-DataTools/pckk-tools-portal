"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "../components/portal/EmptyState";
import { PortalHeader } from "../components/portal/PortalHeader";
import { PortalHero } from "../components/portal/PortalHero";
import { PortalStats } from "../components/portal/PortalStats";
import { ToolCard } from "../components/portal/ToolCard";
import { ToolSearchFilters } from "../components/portal/ToolSearchFilters";
import { buildDisplayTools } from "../components/portal/portal-utils";
import type { Asset, DisplayTool, PortalStatsData, Tool, ToolFilters, Version } from "../components/portal/types";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type RepositorySync = {
  id: string;
  tool_id: string;
  github_owner: string;
  github_repo: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string;
  last_sync_error: string | null;
  last_release_tag: string | null;
};

type GitHubRepositoryOption = {
  installation_id: number;
  installation_account_login: string;
  installation_account_type: string;
  repository_selection: string;
  owner: string;
  repo: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  visibility: string;
  html_url: string | null;
  registered: boolean;
  suggested_slug: string;
  suggested_display_name: string;
};

const defaultFilters: ToolFilters = {
  query: "",
  category: "all",
  latestOnly: true,
  hasDocument: false,
  hasInstaller: false,
};

function getLastUpdatedAt(versions: Version[], assets: Asset[]): string | null {
  const candidates = [
    ...versions.map((version) => version.published_at ?? version.created_at),
    ...assets.map((asset) => asset.created_at),
  ]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [repositories, setRepositories] = useState<RepositorySync[]>([]);
  const [availableRepositories, setAvailableRepositories] = useState<GitHubRepositoryOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [deletingToolId, setDeletingToolId] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const [loadingAvailableRepositories, setLoadingAvailableRepositories] = useState(false);
  const [addingRepository, setAddingRepository] = useState(false);
  const [selectedRepositoryKey, setSelectedRepositoryKey] = useState("");
  const [filters, setFilters] = useState<ToolFilters>(defaultFilters);
  const [toolEdits, setToolEdits] = useState<Record<string, { slug: string; display_name: string; description: string }>>({});
  const [repositoryForm, setRepositoryForm] = useState({
    slug: "",
    display_name: "",
    description: "",
  });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    void initializeSessionData();
  }, [session]);

  useEffect(() => {
    if (!session?.access_token) return;
    void runAutoSyncIfNeeded();
  }, [session?.access_token]);

  useEffect(() => {
    const next: Record<string, { slug: string; display_name: string; description: string }> = {};
    for (const tool of tools) {
      next[tool.id] = {
        slug: tool.slug,
        display_name: tool.display_name,
        description: tool.description ?? "",
      };
    }
    setToolEdits(next);
  }, [tools]);

  async function initializeSessionData() {
    if (!supabase || !session) return;
    setLoading(true);
    setMessage("");
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();
      if (profileError) throw profileError;
      const admin = Boolean(profile?.is_admin);
      setIsAdmin(admin);
      await loadData(admin);
    } catch (error) {
      setMessage(`初期化失敗: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadData(admin = isAdmin) {
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    try {
      const [toolsRes, versionsRes, assetsRes, reposRes] = await Promise.all([
        supabase.from("tools").select("id,slug,display_name,description,is_active").order("display_name"),
        supabase
          .from("tool_versions")
          .select("id,tool_id,version_tag,release_name,github_release_id,published_at,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("tool_assets")
          .select("id,tool_version_id,github_asset_id,asset_name,size_bytes,content_type,created_at")
          .order("asset_name"),
        admin
          ? supabase
              .from("tool_repositories")
              .select(
                "id,tool_id,github_owner,github_repo,sync_enabled,last_synced_at,last_sync_status,last_sync_error,last_release_tag",
              )
              .order("github_owner")
              .order("github_repo")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (toolsRes.error) throw toolsRes.error;
      if (versionsRes.error) throw versionsRes.error;
      if (assetsRes.error) throw assetsRes.error;
      if (reposRes.error) throw reposRes.error;
      setTools((toolsRes.data as Tool[]) ?? []);
      setVersions((versionsRes.data as Version[]) ?? []);
      setAssets((assetsRes.data as Asset[]) ?? []);
      setRepositories((reposRes.data as RepositorySync[]) ?? []);
      setMessage("データを更新しました。");
    } catch (error) {
      setMessage(`読み込み失敗: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(`ログイン失敗: ${error.message}`);
        return;
      }
      setMessage("ログイン成功。");
    } catch (error) {
      if (error instanceof Event) {
        setMessage("ログイン失敗: ネットワークまたは設定エラーです。URL/ANON_KEYを確認してください。");
      } else {
        setMessage(`ログイン失敗: ${String(error)}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsAdmin(false);
    setTools([]);
    setVersions([]);
    setAssets([]);
    setRepositories([]);
    setAvailableRepositories([]);
    setMessage("ログアウトしました。");
  }

  async function downloadByAssetId(assetId: string) {
    if (!supabase) return;
    const asset = assets.find((current) => current.id === assetId);
    if (!asset) {
      setMessage("対象アセットが見つかりません。");
      return;
    }
    setDownloadingAssetId(asset.id);
    setMessage("");
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-release-download`;
      const callDownload = async (accessToken: string) => {
        return await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tool_asset_id: asset.id }),
        });
      };

      const { data: currentSessionData } = await supabase.auth.getSession();
      let accessToken = currentSessionData.session?.access_token ?? session?.access_token ?? "";
      if (!accessToken) {
        throw new Error("セッションがありません。再ログインしてください。");
      }
      let res = await callDownload(accessToken);
      if (res.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) {
          throw new Error(`401 Unauthorized (refresh failed: ${refreshError?.message ?? "no session"})`);
        }
        accessToken = refreshed.session.access_token;
        res = await callDownload(accessToken);
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = asset.asset_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`ダウンロード成功: ${asset.asset_name}`);
    } catch (error) {
      setMessage(`ダウンロード失敗: ${String(error)}`);
    } finally {
      setDownloadingAssetId(null);
    }
  }

  async function runSyncNow() {
    if (!supabase || !session?.access_token || !isAdmin) return;
    setRunningSync(true);
    setMessage("");
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-release-sync`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${text}`);
      setMessage(`同期成功: ${text}`);
      await loadData(true);
    } catch (error) {
      setMessage(`同期失敗: ${String(error)}`);
    } finally {
      setRunningSync(false);
    }
  }

  async function runAutoSyncIfNeeded() {
    if (!supabase || !session?.access_token) return;
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-release-sync`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.status === "success" || result.status === "partial") {
        await loadData(isAdmin);
      }
    } catch {
      // 自動同期はベストエフォートで実行する
    }
  }

  async function saveTool(tool: Tool) {
    if (!supabase || !isAdmin) return;
    const edit = toolEdits[tool.id];
    if (!edit) return;
    setSavingToolId(tool.id);
    setMessage("");
    try {
      const slug = edit.slug.trim();
      const displayName = edit.display_name.trim();
      const description = edit.description.trim();
      if (!slug || !displayName) {
        throw new Error("slug と 表示名は必須です。");
      }
      const { error } = await supabase
        .from("tools")
        .update({
          slug,
          display_name: displayName,
          description: description === "" ? null : description,
        })
        .eq("id", tool.id);
      if (error) throw error;
      await loadData(true);
      setMessage(`ツールを更新しました: ${displayName}`);
    } catch (error) {
      setMessage(`ツール更新失敗: ${String(error)}`);
    } finally {
      setSavingToolId(null);
    }
  }

  async function deleteTool(tool: Tool) {
    if (!supabase || !isAdmin) return;
    const ok = window.confirm(`ツール「${tool.display_name}」を削除します。関連データも削除されます。続行しますか？`);
    if (!ok) return;
    setDeletingToolId(tool.id);
    setMessage("");
    try {
      const { error } = await supabase.from("tools").delete().eq("id", tool.id);
      if (error) throw error;
      await Promise.all([loadData(true), loadAvailableRepositories()]);
      setMessage(`ツールを削除しました: ${tool.display_name}`);
    } catch (error) {
      setMessage(`ツール削除失敗: ${String(error)}`);
    } finally {
      setDeletingToolId(null);
    }
  }

  function repositoryKey(repo: GitHubRepositoryOption) {
    return `${repo.installation_id}:${repo.full_name}`;
  }

  async function loadAvailableRepositories() {
    if (!session?.access_token || !isAdmin) return;
    setLoadingAvailableRepositories(true);
    setMessage("");
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-repository-admin`;
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? JSON.stringify(json));
      setAvailableRepositories((json.repositories as GitHubRepositoryOption[]) ?? []);
      setMessage(
        `GitHubリポジトリ一覧を取得しました: ${(json.repositories ?? []).length}件 / installations ${(json.installations ?? []).length}件`,
      );
    } catch (error) {
      setMessage(`GitHubリポジトリ一覧取得失敗: ${String(error)}`);
    } finally {
      setLoadingAvailableRepositories(false);
    }
  }

  function selectRepository(key: string) {
    setSelectedRepositoryKey(key);
    const repo = availableRepositories.find((item) => repositoryKey(item) === key);
    if (!repo) {
      setRepositoryForm({ slug: "", display_name: "", description: "" });
      return;
    }
    setRepositoryForm({
      slug: repo.suggested_slug,
      display_name: repo.suggested_display_name,
      description: "",
    });
  }

  async function addSelectedRepository() {
    if (!session?.access_token || !isAdmin) return;
    const repo = availableRepositories.find((item) => repositoryKey(item) === selectedRepositoryKey);
    if (!repo) {
      setMessage("追加対象のリポジトリを選択してください。");
      return;
    }
    setAddingRepository(true);
    setMessage("");
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-repository-admin`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.repo,
          installation_id: repo.installation_id,
          slug: repositoryForm.slug,
          display_name: repositoryForm.display_name,
          description: repositoryForm.description,
          sync_enabled: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? JSON.stringify(json));
      setMessage(`リポジトリを追加しました: ${repo.full_name}`);
      setSelectedRepositoryKey("");
      setRepositoryForm({ slug: "", display_name: "", description: "" });
      await Promise.all([loadData(true), loadAvailableRepositories()]);
    } catch (error) {
      setMessage(`リポジトリ追加失敗: ${String(error)}`);
    } finally {
      setAddingRepository(false);
    }
  }

  const visibleTools = useMemo(() => (isAdmin ? tools : tools.filter((tool) => tool.is_active)), [isAdmin, tools]);
  const displayTools = useMemo<DisplayTool[]>(
    () => buildDisplayTools(visibleTools, versions, assets),
    [assets, versions, visibleTools],
  );
  const categories = useMemo(() => [...new Set(displayTools.map((tool) => tool.category))].sort((a, b) => a.localeCompare(b, "ja")), [displayTools]);
  const filteredTools = useMemo(() => {
    return displayTools.filter((tool) => {
      const query = filters.query.trim().toLowerCase();
      const keywordPass =
        query === "" ||
        [tool.name, tool.slug, tool.description, tool.category, tool.targetWork].some((item) => item.toLowerCase().includes(query));
      if (!keywordPass) return false;
      if (filters.category !== "all" && tool.category !== filters.category) return false;
      if (filters.latestOnly && !tool.latestVersion) return false;
      if (filters.hasDocument && !tool.documentAsset) return false;
      if (filters.hasInstaller && !tool.latestVersion?.assets.some((asset) => asset.kind === "app")) return false;
      return true;
    });
  }, [displayTools, filters]);
  const portalStats = useMemo<PortalStatsData>(
    () => ({
      activeTools: visibleTools.filter((tool) => tool.is_active).length,
      latestVersions: displayTools.filter((tool) => tool.latestVersion).length,
      assets: displayTools.reduce((sum, tool) => sum + (tool.latestVersion?.assets.length ?? 0), 0),
      lastUpdatedAt: getLastUpdatedAt(versions, assets),
    }),
    [assets, displayTools, versions, visibleTools],
  );
  const toolNameById = useMemo(() => new Map(tools.map((tool) => [tool.id, tool.display_name])), [tools]);
  const unregisteredRepositories = useMemo(
    () => availableRepositories.filter((repo) => !repo.registered && !repo.archived),
    [availableRepositories],
  );

  return (
    <main className="portal-page">
      <div className="portal-shell">
        {!supabase ? (
          <section className="panel">
            <h2>環境変数が未設定です</h2>
            <p className="muted">
              <code>NEXT_PUBLIC_SUPABASE_URL</code> と <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を{" "}
              <code>apps/web/.env.local</code> に設定してください。
            </p>
          </section>
        ) : null}

        {supabase && !session ? (
          <section className="panel login-panel">
            <h2>ログイン</h2>
            <div className="login-form">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="password"
              />
              <button className="button-primary" disabled={loading} onClick={signIn}>
                {loading ? "処理中..." : "ログイン"}
              </button>
            </div>
          </section>
        ) : null}

        {supabase && session ? (
          <>
            <PortalHeader
              email={session.user.email ?? "-"}
              userId={session.user.id}
              role={isAdmin ? "admin" : "user"}
              loading={loading}
              onReload={() => void loadData()}
              onLogout={() => void signOut()}
            />
            <PortalHero />
            <PortalStats stats={portalStats} />
            <ToolSearchFilters filters={filters} categories={categories} onChange={setFilters} onReset={() => setFilters(defaultFilters)} />

            {filteredTools.length === 0 ? (
              <EmptyState title="該当するツールがありません" description="検索条件またはフィルタ条件を見直してください。" />
            ) : (
              <section className="tools-grid">
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    downloadingAssetId={downloadingAssetId}
                    onDownload={(assetId) => void downloadByAssetId(assetId)}
                  />
                ))}
              </section>
            )}

            {isAdmin ? (
              <section className="panel admin-panel">
                <h2>管理セクション</h2>
                <div className="admin-row">
                  <button className="button-primary" disabled={runningSync} onClick={() => void runSyncNow()}>
                    {runningSync ? "同期中..." : "今すぐ同期"}
                  </button>
                </div>

                <h3>GitHubリポジトリ追加</h3>
                <div className="admin-row">
                  <button
                    className="button-secondary"
                    disabled={loadingAvailableRepositories}
                    onClick={() => void loadAvailableRepositories()}
                  >
                    {loadingAvailableRepositories ? "取得中..." : "GitHub Appのリポジトリ一覧を取得"}
                  </button>
                  <span className="muted">
                    取得済み {availableRepositories.length}件 / 未登録 {unregisteredRepositories.length}件
                  </span>
                </div>

                {availableRepositories.length > 0 ? (
                  <div className="admin-form-grid">
                    <select value={selectedRepositoryKey} onChange={(event) => selectRepository(event.target.value)}>
                      <option value="">追加するリポジトリを選択</option>
                      {availableRepositories.map((repo) => (
                        <option key={repositoryKey(repo)} value={repositoryKey(repo)} disabled={repo.registered || repo.archived}>
                          [{repo.installation_account_login}] {repo.full_name} / {repo.visibility}
                          {repo.registered ? " / 登録済み" : ""}
                          {repo.archived ? " / archived" : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      value={repositoryForm.slug}
                      onChange={(event) => setRepositoryForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="slug"
                    />
                    <input
                      value={repositoryForm.display_name}
                      onChange={(event) => setRepositoryForm((current) => ({ ...current, display_name: event.target.value }))}
                      placeholder="表示名"
                    />
                    <input
                      value={repositoryForm.description}
                      onChange={(event) => setRepositoryForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="説明（任意）"
                    />
                    <button
                      className="button-primary"
                      disabled={addingRepository || !selectedRepositoryKey}
                      onClick={() => void addSelectedRepository()}
                    >
                      {addingRepository ? "追加中..." : "選択リポジトリを追加"}
                    </button>
                  </div>
                ) : null}

                <h3>ツール編集/削除</h3>
                <div className="admin-list">
                  {tools.map((tool) => (
                    <article key={`admin-tool-${tool.id}`} className="admin-item">
                      <input
                        value={toolEdits[tool.id]?.slug ?? ""}
                        onChange={(event) =>
                          setToolEdits((current) => ({
                            ...current,
                            [tool.id]: {
                              ...(current[tool.id] ?? { slug: "", display_name: "", description: "" }),
                              slug: event.target.value,
                            },
                          }))
                        }
                        placeholder="slug"
                      />
                      <input
                        value={toolEdits[tool.id]?.display_name ?? ""}
                        onChange={(event) =>
                          setToolEdits((current) => ({
                            ...current,
                            [tool.id]: {
                              ...(current[tool.id] ?? { slug: "", display_name: "", description: "" }),
                              display_name: event.target.value,
                            },
                          }))
                        }
                        placeholder="表示名"
                      />
                      <input
                        value={toolEdits[tool.id]?.description ?? ""}
                        onChange={(event) =>
                          setToolEdits((current) => ({
                            ...current,
                            [tool.id]: {
                              ...(current[tool.id] ?? { slug: "", display_name: "", description: "" }),
                              description: event.target.value,
                            },
                          }))
                        }
                        placeholder="説明（任意）"
                      />
                      <div className="admin-actions">
                        <button
                          className="button-secondary"
                          disabled={savingToolId === tool.id || deletingToolId === tool.id}
                          onClick={() => void saveTool(tool)}
                        >
                          {savingToolId === tool.id ? "保存中..." : "保存"}
                        </button>
                        <button
                          className="button-danger"
                          disabled={savingToolId === tool.id || deletingToolId === tool.id}
                          onClick={() => void deleteTool(tool)}
                        >
                          {deletingToolId === tool.id ? "削除中..." : "削除"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <h3>同期ステータス</h3>
                {repositories.length === 0 ? <p className="muted">対象リポジトリなし</p> : null}
                <div className="admin-list">
                  {repositories.map((repo) => (
                    <article key={repo.id} className="admin-item">
                      <strong>
                        {repo.github_owner}/{repo.github_repo}
                      </strong>
                      <span className="muted">tool: {toolNameById.get(repo.tool_id) ?? repo.tool_id}</span>
                      <span className="muted">sync_enabled: {String(repo.sync_enabled)}</span>
                      <span className="muted">last_sync_status: {repo.last_sync_status}</span>
                      <span className="muted">last_release_tag: {repo.last_release_tag ?? "-"}</span>
                      <span className="muted">last_synced_at: {repo.last_synced_at ?? "-"}</span>
                      {repo.last_sync_error ? <span className="error-text">last_sync_error: {repo.last_sync_error}</span> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {message ? <p className={`notice ${message.includes("失敗") ? "error-text" : ""}`}>{message}</p> : null}
      </div>
    </main>
  );
}
