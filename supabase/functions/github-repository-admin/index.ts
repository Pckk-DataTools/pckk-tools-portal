import { createClient } from "npm:@supabase/supabase-js@2";
import { KJUR } from "npm:jsrsasign@11";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_APP_ID = Deno.env.get("GITHUB_APP_ID")!;
const RAW_GITHUB_APP_PRIVATE_KEY = Deno.env.get("GITHUB_APP_PRIVATE_KEY")!;
const GITHUB_API_VERSION = "2022-11-28";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type RepoRow = {
  github_owner: string;
  github_repo: string;
  github_installation_id: number;
};

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  visibility?: string;
  html_url?: string;
  owner: {
    login: string;
  };
};

type CreateRepositoryRequest = {
  owner: string;
  repo: string;
  installation_id: number;
  slug: string;
  display_name: string;
  description?: string;
  sync_enabled?: boolean;
  default_asset_pattern?: string;
};

function normalizePrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^[']|[']$/g, "")
    .replace(/^[\"]|[\"]$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
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

async function assertAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, reason: "Unauthorized" };

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return { ok: false, status: 401, reason: "Unauthorized" };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile?.is_admin) return { ok: false, status: 403, reason: "Forbidden" };
  return { ok: true, status: 200, reason: "OK" };
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function listInstallationIds() {
  const { data, error } = await supabaseAdmin
    .from("tool_repositories")
    .select("github_owner, github_repo, github_installation_id")
    .order("github_owner")
    .order("github_repo");

  if (error) throw new Error(`registered repositories load error: ${error.message}`);

  const rows = (data ?? []) as RepoRow[];
  const installationIds = [...new Set(rows.map((row) => Number(row.github_installation_id)).filter(Boolean))];
  return { rows, installationIds };
}

async function listRepositoriesForInstallation(installationId: number) {
  const token = await getInstallationToken(installationId);
  const repositories: GitHubRepository[] = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`repositories fetch error: ${await response.text()}`);
    }

    const json = await response.json() as { repositories: GitHubRepository[] };
    repositories.push(...json.repositories);
    if (json.repositories.length < 100) break;
    page += 1;
  }

  return repositories.map((repo) => ({
    installation_id: installationId,
    owner: repo.owner.login,
    repo: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    archived: repo.archived,
    visibility: repo.visibility ?? (repo.private ? "private" : "public"),
    html_url: repo.html_url ?? null,
  }));
}

async function listAvailableRepositories() {
  const { rows, installationIds } = await listInstallationIds();
  if (installationIds.length === 0) {
    return { repositories: [], registered: [] };
  }

  const registeredKeys = new Set(rows.map((row) => `${row.github_owner}/${row.github_repo}`.toLowerCase()));
  const repositories = (await Promise.all(
    installationIds.map((installationId) => listRepositoriesForInstallation(installationId)),
  )).flat();

  repositories.sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    repositories: repositories.map((repo) => ({
      ...repo,
      registered: registeredKeys.has(repo.full_name.toLowerCase()),
      suggested_slug: toSlug(repo.repo),
      suggested_display_name: repo.repo,
    })),
    registered: rows,
  };
}

async function verifyRepositoryAccess(input: CreateRepositoryRequest) {
  const token = await getInstallationToken(Number(input.installation_id));
  const response = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`repository access check failed: ${await response.text()}`);
  }

  const repo = await response.json() as GitHubRepository;
  if (repo.owner.login.toLowerCase() !== input.owner.toLowerCase() || repo.name.toLowerCase() !== input.repo.toLowerCase()) {
    throw new Error("repository response mismatch");
  }
}

async function createRepository(input: CreateRepositoryRequest) {
  const owner = input.owner?.trim();
  const repo = input.repo?.trim();
  const installationId = Number(input.installation_id);
  const slug = toSlug(input.slug || repo || "");
  const displayName = input.display_name?.trim() || repo;
  const description = input.description?.trim() || null;
  const syncEnabled = input.sync_enabled ?? true;
  const defaultAssetPattern = input.default_asset_pattern?.trim() || null;

  if (!owner || !repo || !installationId || !slug || !displayName) {
    return jsonResponse({ error: "owner, repo, installation_id, slug, display_name are required" }, 400);
  }

  const { data: existingRepo, error: existingRepoError } = await supabaseAdmin
    .from("tool_repositories")
    .select("id")
    .eq("github_owner", owner)
    .eq("github_repo", repo)
    .maybeSingle();

  if (existingRepoError) throw new Error(`repository lookup error: ${existingRepoError.message}`);
  if (existingRepo) return jsonResponse({ error: "repository already registered" }, 409);

  await verifyRepositoryAccess({ ...input, owner, repo, installation_id: installationId });

  const { data: tool, error: toolError } = await supabaseAdmin
    .from("tools")
    .insert({
      slug,
      display_name: displayName,
      description,
      is_active: true,
    })
    .select("id,slug,display_name,description,is_active")
    .single();

  if (toolError) throw new Error(`tool insert error: ${toolError.message}`);

  const { data: repository, error: repositoryError } = await supabaseAdmin
    .from("tool_repositories")
    .insert({
      tool_id: tool.id,
      github_owner: owner,
      github_repo: repo,
      github_installation_id: installationId,
      default_asset_pattern: defaultAssetPattern,
      release_channel: "stable",
      sync_enabled: syncEnabled,
    })
    .select("id,tool_id,github_owner,github_repo,github_installation_id,sync_enabled,last_sync_status")
    .single();

  if (repositoryError) throw new Error(`repository insert error: ${repositoryError.message}`);

  return jsonResponse({ tool, repository }, 201);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const auth = await assertAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.reason }, auth.status);

  try {
    if (req.method === "GET") {
      return jsonResponse(await listAvailableRepositories());
    }

    if (req.method === "POST") {
      const payload = await req.json() as CreateRepositoryRequest;
      return await createRepository(payload);
    }

    return jsonResponse({ error: "Method Not Allowed" }, 405);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});
