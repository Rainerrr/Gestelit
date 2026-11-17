import { defineConfig } from "vitest/config";
import path from "node:path";
// No application database setup/teardown. Live tool checks are separately opt-in.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/ai-*.test.ts", "tests/integration/ai-tools-readonly.test.ts"],
    testTimeout: 120000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
