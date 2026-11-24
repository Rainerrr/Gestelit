import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });
it("does not retain refresh timers after repeated service-role reads", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.resetModules();
  const { createServiceSupabase } = await import("@/lib/supabase/client");
  const interval = vi.spyOn(globalThis, "setInterval");
  const clients = Array.from({ length: 100 }, () => createServiceSupabase());
  try {
    await Promise.all(clients.map(client => client.auth.initialize()));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(interval).not.toHaveBeenCalled();
  } finally {
    await Promise.all(clients.map(client => client.auth.stopAutoRefresh()));
  }
});
