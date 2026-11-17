import { defineConfig } from "vitest/config";
import path from "node:path";
// Deliberately excludes the integration setup/teardown that mutates a database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
