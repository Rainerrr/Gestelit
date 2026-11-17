import { defineConfig } from "vitest/config";
import path from "node:path";
// Unit tests must never load live database setup or global teardown.
export default defineConfig({
  test: { environment: "node", include: ["tests/unit/bina-dashboard-regressions.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
