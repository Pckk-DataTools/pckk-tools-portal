"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type Tool = {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
};

type Version = {
  id: string;
  tool_id: string;
  version_tag: string;
};

type Asset = {
  id: string;
  tool_version_id: string;
  asset_name: string;
  size_bytes: number | null;
};

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

function bytes(v: number | null): string {
  if (!v) return "-";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);

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
        supabase.from("tool_versions").select("id,tool_id,version_tag").order("created_at", { ascending: false }),
        supabase.from("tool_assets").select("id,tool_version_id,asset_name,size_bytes").order("asset_name"),
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
    setMessage("ログアウトしました。");
  }

  async function download(asset: Asset) {
    if (!supabase) return;
    if (!session?.access_token) {
      setMessage("セッションがありません。再ログインしてください。");
      return;
    }
    setDownloadingAssetId(asset.id);
    setMessage("");
    try {
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-release-download`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool_asset_id: asset.id }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.asset_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
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

  async function toggleToolActive(tool: Tool) {
    if (!supabase || !isAdmin) return;
    setTogglingToolId(tool.id);
    setMessage("");
    try {
      const { error } = await supabase
        .from("tools")
        .update({ is_active: !tool.is_active })
        .eq("id", tool.id);
      if (error) throw error;
      await loadData(true);
      setMessage(`ツール状態を更新しました: ${tool.display_name}`);
    } catch (error) {
      setMessage(`ツール状態更新失敗: ${String(error)}`);
    } finally {
      setTogglingToolId(null);
    }
  }

  const versionById = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  const versionsByTool = useMemo(() => {
    const m = new Map<string, Version[]>();
    for (const v of versions) {
      const arr = m.get(v.tool_id) ?? [];
      arr.push(v);
      m.set(v.tool_id, arr);
    }
    return m;
  }, [versions]);
  const assetsByVersion = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of assets) {
      const arr = m.get(a.tool_version_id) ?? [];
      arr.push(a);
      m.set(a.tool_version_id, arr);
    }
    return m;
  }, [assets]);
  const visibleTools = useMemo(() => (isAdmin ? tools : tools.filter((tool) => tool.is_active)), [isAdmin, tools]);
  const toolNameById = useMemo(() => new Map(tools.map((tool) => [tool.id, tool.display_name])), [tools]);

  return (
    <main className="page">
      <div className="shell">
        <section className="head">
          <h1>PCKK Tools Portal</h1>
          <p>Supabase Auth + Edge Function 経由で private release asset を配布</p>
        </section>

        <section className="body">
          {!supabase ? (
            <div className="panel">
              <h2>環境変数が未設定です</h2>
              <p className="meta">
                <code>NEXT_PUBLIC_SUPABASE_URL</code> と <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を{" "}
                <code>apps/web/.env.local</code> に設定してください。
              </p>
            </div>
          ) : null}

          {supabase && !session ? (
            <div className="panel">
              <h2>ログイン</h2>
              <div className="grid">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="password"
                />
                <div className="row">
                  <button disabled={loading} onClick={signIn}>
                    {loading ? "処理中..." : "ログイン"}
                  </button>
                </div>
              </div>
            </div>
          ) : supabase ? (
            <>
              <div className="panel">
                <div className="row">
                  <strong>{session?.user.email}</strong>
                  <span className="meta">UID: {session?.user.id}</span>
                  <span className="meta">role: {isAdmin ? "admin" : "user"}</span>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="secondary" disabled={loading} onClick={() => void loadData()}>
                    再読み込み
                  </button>
                  <button className="warn" onClick={signOut}>
                    ログアウト
                  </button>
                </div>
              </div>

              {isAdmin ? (
                <div className="panel">
                  <h2>管理セクション</h2>
                  <div className="row">
                    <button disabled={runningSync} onClick={() => void runSyncNow()}>
                      {runningSync ? "同期中..." : "今すぐ同期"}
                    </button>
                  </div>

                  <h3 style={{ marginTop: 14 }}>ツール有効/無効</h3>
                  {tools.map((tool) => (
                    <div key={`admin-tool-${tool.id}`} className="row" style={{ marginTop: 8 }}>
                      <span>{tool.display_name}</span>
                      <span className="meta">{tool.slug}</span>
                      <span className="meta">status: {tool.is_active ? "active" : "inactive"}</span>
                      <button
                        className="secondary"
                        disabled={togglingToolId === tool.id}
                        onClick={() => void toggleToolActive(tool)}
                      >
                        {togglingToolId === tool.id ? "更新中..." : tool.is_active ? "無効化" : "有効化"}
                      </button>
                    </div>
                  ))}

                  <h3 style={{ marginTop: 14 }}>同期ステータス</h3>
                  {repositories.length === 0 ? <p className="meta">対象リポジトリなし</p> : null}
                  {repositories.map((repo) => (
                    <div key={repo.id} className="asset">
                      <div className="row">
                        <strong>
                          {repo.github_owner}/{repo.github_repo}
                        </strong>
                        <span className="meta">tool: {toolNameById.get(repo.tool_id) ?? repo.tool_id}</span>
                      </div>
                      <div className="meta">sync_enabled: {String(repo.sync_enabled)}</div>
                      <div className="meta">last_sync_status: {repo.last_sync_status}</div>
                      <div className="meta">last_release_tag: {repo.last_release_tag ?? "-"}</div>
                      <div className="meta">last_synced_at: {repo.last_synced_at ?? "-"}</div>
                      {repo.last_sync_error ? <div className="meta error">last_sync_error: {repo.last_sync_error}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="panel">
                <h2>ツール一覧</h2>
                {visibleTools.map((tool) => {
                  const toolVersions = versionsByTool.get(tool.id) ?? [];
                  return (
                    <div key={tool.id} className="tool">
                      <h3>{tool.display_name}</h3>
                      <div className="meta">{tool.slug}</div>
                      {tool.description ? <p className="meta">{tool.description}</p> : null}

                      {toolVersions.length === 0 ? <p className="meta">バージョン情報なし</p> : null}
                      {toolVersions.map((version) => {
                        const vAssets = assetsByVersion.get(version.id) ?? [];
                        return (
                          <div key={version.id} className="asset">
                            <div className="row">
                              <strong>{version.version_tag}</strong>
                              <span className="meta">version_id: {version.id}</span>
                            </div>
                            {vAssets.length === 0 ? <div className="meta">assetなし</div> : null}
                            {vAssets.map((asset) => (
                              <div key={asset.id} className="row" style={{ marginTop: 8 }}>
                                <span>{asset.asset_name}</span>
                                <span className="meta">{bytes(asset.size_bytes)}</span>
                                <button
                                  disabled={downloadingAssetId === asset.id}
                                  onClick={() => void download(asset)}
                                >
                                  {downloadingAssetId === asset.id ? "取得中..." : "ダウンロード"}
                                </button>
                                <span className="meta">asset_id: {asset.id}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {message ? <p className={`notice ${message.includes("失敗") ? "error" : ""}`}>{message}</p> : null}
          {versionById.size > 0 && session ? (
            <p className="meta">
              読み込み済み: tools {tools.length} / versions {versions.length} / assets {assets.length}
              {isAdmin ? ` / repositories ${repositories.length}` : ""}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
