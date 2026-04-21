import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function normalizeUrl(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !supabaseAnonKey) return null;
  const supabaseUrl = normalizeUrl(rawUrl);
  if (!isHttpUrl(supabaseUrl)) return null;
  try {
    client = createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    return null;
  }
  return client;
}
