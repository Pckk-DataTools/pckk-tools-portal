import { createClient } from "npm:@supabase/supabase-js@2"
import * as jose from "npm:jose"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const GITHUB_APP_ID = Deno.env.get("GITHUB_APP_ID")!
const GITHUB_APP_PRIVATE_KEY = Deno.env.get("GITHUB_APP_PRIVATE_KEY")!
const GITHUB_API_VERSION = "2022-11-28"

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

type DownloadRequest = {
  tool_asset_id: string
}

async function createGitHubAppJwt() {
  const privateKey = await jose.importPKCS8(GITHUB_APP_PRIVATE_KEY, "RS256")
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("9m")
    .setIssuer(GITHUB_APP_ID)
    .sign(privateKey)
}

async function getInstallationToken(installationId: number) {
  const appJwt = await createGitHubAppJwt()
  const tokenResponse = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        permissions: { contents: "read" },
      }),
    },
  )

  if (!tokenResponse.ok) {
    throw new Error(`installation token error: ${await tokenResponse.text()}`)
  }

  const tokenJson = await tokenResponse.json() as { token: string }
  return tokenJson.token
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 })
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  let payload: DownloadRequest
  try {
    payload = await req.json() as DownloadRequest
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }
  if (!payload.tool_asset_id) {
    return new Response("tool_asset_id is required", { status: 400 })
  }

  try {
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("tool_assets")
      .select("id, asset_name, github_asset_id, tool_version_id")
      .eq("id", payload.tool_asset_id)
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

    const installationToken = await getInstallationToken(repoRow.github_installation_id)
    const ghResponse = await fetch(
      `https://api.github.com/repos/${repoRow.github_owner}/${repoRow.github_repo}/releases/assets/${asset.github_asset_id}`,
      {
        headers: {
          "Accept": "application/octet-stream",
          "Authorization": `Bearer ${installationToken}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        redirect: "follow",
      },
    )

    if (!ghResponse.ok) {
      const body = await ghResponse.text()
      await supabaseAdmin.from("download_logs").insert({
        user_id: authData.user.id,
        tool_asset_id: payload.tool_asset_id,
        tool_version_id: asset.tool_version_id,
        tool_id: versionRow.tool_id,
        status: "error",
        error_message: body,
        user_agent: req.headers.get("user-agent"),
      })
      return new Response("GitHub download failed", { status: 502 })
    }

    await supabaseAdmin.from("download_logs").insert({
      user_id: authData.user.id,
      tool_asset_id: payload.tool_asset_id,
      tool_version_id: asset.tool_version_id,
      tool_id: versionRow.tool_id,
      status: "success",
      user_agent: req.headers.get("user-agent"),
    })

    return new Response(ghResponse.body, {
      status: 200,
      headers: {
        "Content-Type": ghResponse.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.asset_name}"`,
      },
    })
  } catch (error) {
    return new Response(String(error), { status: 500 })
  }
})
