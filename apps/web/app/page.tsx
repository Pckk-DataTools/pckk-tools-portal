"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type Tool = {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
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

function bytes(v: number | null): string {
  if (!v) return "-";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("yuuta.ochiai@tk.pacific.co.jp");
  const [password, setPassword] = useState("0410");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
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
    void loadData();
  }, [session]);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    try {
      const [toolsRes, versionsRes, assetsRes] = await Promise.all([
        supabase.from("tools").select("id,slug,display_name,description").eq("is_active", true).order("display_name"),
        supabase.from("tool_versions").select("id,tool_id,version_tag").order("created_at", { ascending: false }),
        supabase.from("tool_assets").select("id,tool_version_id,asset_name,size_bytes").order("asset_name"),
      ]);
      if (toolsRes.error) throw toolsRes.error;
      if (versionsRes.error) throw versionsRes.error;
      if (assetsRes.error) throw assetsRes.error;
      setTools((toolsRes.data as Tool[]) ?? []);
      setVersions((versionsRes.data as Version[]) ?? []);
      setAssets((assetsRes.data as Asset[]) ?? []);
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
    setTools([]);
    setVersions([]);
    setAssets([]);
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

              <div className="panel">
                <h2>ツール一覧</h2>
                {tools.map((tool) => {
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
            <p className="meta">読み込み済み: tools {tools.length} / versions {versions.length} / assets {assets.length}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
