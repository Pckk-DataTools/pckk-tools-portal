import { createClient } from "npm:@supabase/supabase-js@2";
import { KJUR } from "npm:jsrsasign@11";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_APP_ID = Deno.env.get("GITHUB_APP_ID")!;
const RAW_GITHUB_APP_PRIVATE_KEY = Deno.env.get("GITHUB_APP_PRIVATE_KEY")!;
const SYNC_CRON_SECRET = Deno.env.get("SYNC_CRON_SECRET");
const GITHUB_API_VERSION = "2022-11-28";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type RepoRow = {
  id: string;
  tool_id: string;
  github_owner: string;
  github_repo: string;
  github_installation_id: number;
  sync_enabled: boolean;
};

type GitHubAsset = {
  id: number;
  name: string;
  content_type?: string;
  size?: number;
};

type GitHubRelease = {
  id: number;
  tag_name: string;
  name?: string;
  body?: string;
  published_at?: string;
  assets?: GitHubAsset[];
  draft?: boolean;
  prerelease?: boolean;
};


function normalizePrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

async function createGitHubAppJwt() {
  const privateKeyPem = normalizePrivateKey(RAW_GITHUB_APP_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: GITHUB_APP_ID,
  };
  return KJUR.jws.JWS.sign(
    "RS256",
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
    JSON.stringify(payload),
    privateKeyPem,
  );
}

async function getInstallationToken(installationId: number) {
  const appJwt = await createGitHubAppJwt();
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        permissions: { contents: "read" },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`installation token error: ${await response.text()}`);
  }

  const json = await response.json() as { token: string };
  return json.token;
}

async function fetchReleases(repo: RepoRow): Promise<GitHubRelease[]> {
  const installationToken = await getInstallationToken(repo.github_installation_id);
  const response = await fetch(
    `https://api.github.com/repos/${repo.github_owner}/${repo.github_repo}/releases?per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${installationToken}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  if (response.status === 404) {
    throw new Error("releases not found");
  }
  if (!response.ok) {
    throw new Error(`releases fetch error: ${await response.text()}`);
  }

  return await response.json() as GitHubRelease[];
}


async function assertManualAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, reason: "Unauthorized" };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { ok: false, reason: "Unauthorized" };
  }

  return { ok: true, userId: authData.user.id };
}

async function upsertVersion(toolId: string, release: GitHubRelease) {
  const publishedAt = release.published_at ?? null;
  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("tool_versions")
    .upsert({
      tool_id: toolId,
      version_tag: release.tag_name,
      release_name: release.name ?? release.tag_name,
      github_release_id: release.id,
      published_at: publishedAt,
      release_notes: release.body ?? "",
    }, { onConflict: "tool_id,version_tag" })
    .select("id")
    .single();

  if (!upsertError && upserted?.id) return upserted.id as string;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("tool_versions")
    .select("id")
    .eq("tool_id", toolId)
    .eq("version_tag", release.tag_name)
    .single();

  if (existingError || !existing?.id) {
    throw new Error(`version upsert failed: ${upsertError?.message ?? existingError?.message ?? "unknown"}`);
  }

  return existing.id as string;
}

async function upsertAssets(toolVersionId: string, assets: GitHubAsset[]) {
  if (assets.length === 0) return;
  const rows = assets.map((asset) => ({
    tool_version_id: toolVersionId,
    github_asset_id: asset.id,
    asset_name: asset.name,
    content_type: asset.content_type ?? null,
    size_bytes: asset.size ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("tool_assets")
    .upsert(rows, { onConflict: "github_asset_id" });

  if (error) {
    throw new Error(`asset upsert failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  const isScheduled = Boolean(SYNC_CRON_SECRET) && req.headers.get("x-sync-secret") === SYNC_CRON_SECRET;
  const triggerType = isScheduled ? "scheduled" : "manual";

  if (!isScheduled) {
    const auth = await assertManualAdmin(req);
    if (!auth.ok) {
      return new Response(auth.reason, { status: 401, headers: CORS_HEADERS });
    }
  }

  const cooldownIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRuns, error: recentRunsError } = await supabaseAdmin
    .from("sync_runs")
    .select("id,started_at,status")
    .gte("started_at", cooldownIso)
    .order("started_at", { ascending: false })
    .limit(1);
  if (recentRunsError) {
    return new Response(`sync run check error: ${recentRunsError.message}`, { status: 500, headers: CORS_HEADERS });
  }
  if ((recentRuns ?? []).length > 0) {
    return new Response(JSON.stringify({
      status: "skipped_recent",
      trigger_type: triggerType,
      reason: "recent sync exists within 10 minutes",
      last_run: recentRuns?.[0] ?? null,
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  }

  const startedAt = new Date().toISOString();
  const { data: repos, error: reposError } = await supabaseAdmin
    .from("tool_repositories")
    .select("id, tool_id, github_owner, github_repo, github_installation_id, sync_enabled")
    .eq("sync_enabled", true);

  if (reposError) {
    return new Response(`repositories load error: ${reposError.message}`, { status: 500, headers: CORS_HEADERS });
  }

  const repoRows = (repos ?? []) as RepoRow[];
  const failures: Array<{ repository_id: string; repository: string; error: string }> = [];
  let successRepos = 0;

  for (const repo of repoRows) {
    try {
      const releases = await fetchReleases(repo);
      if (releases.length === 0) {
        throw new Error("no releases found");
      }

      for (const release of releases) {
        if (release.draft) continue;
        const versionId = await upsertVersion(repo.tool_id, release);
        await upsertAssets(versionId, release.assets ?? []);
      }

      const latestRelease = releases.find((r) => !r.prerelease && !r.draft) ?? releases[0];

      const { error: updateError } = await supabaseAdmin
        .from("tool_repositories")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "success",
          last_sync_error: null,
          last_release_tag: latestRelease.tag_name,
        })
        .eq("id", repo.id);

      if (updateError) {
        throw new Error(`repository state update error: ${updateError.message}`);
      }
      successRepos += 1;
    } catch (error) {
      const message = String(error);
      failures.push({
        repository_id: repo.id,
        repository: `${repo.github_owner}/${repo.github_repo}`,
        error: message,
      });
      await supabaseAdmin
        .from("tool_repositories")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: message,
        })
        .eq("id", repo.id);
    }
  }

  const failedRepos = failures.length;
  const status = failedRepos === 0 ? "success" : successRepos > 0 ? "partial" : "error";
  const finishedAt = new Date().toISOString();

  await supabaseAdmin.from("sync_runs").insert({
    trigger_type: triggerType,
    status,
    total_repos: repoRows.length,
    success_repos: successRepos,
    failed_repos: failedRepos,
    started_at: startedAt,
    finished_at: finishedAt,
    summary_json: {
      failures,
    },
  });

  return new Response(JSON.stringify({
    status,
    trigger_type: triggerType,
    total_repos: repoRows.length,
    success_repos: successRepos,
    failed_repos: failedRepos,
    failures,
  }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
});
