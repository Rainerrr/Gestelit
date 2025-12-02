import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function createBrowserSupabase(): SupabaseClient {
  const url = assertEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = assertEnv(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
    },
  });
}

export function createServiceSupabase(): SupabaseClient {
  const url = assertEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = assertEnv(
    supabaseServiceKey,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}

