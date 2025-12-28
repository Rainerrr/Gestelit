import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), ".env.local") });

// Validate required environment variables
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Global test utilities
export const TEST_PREFIX = `test_${Date.now()}`;

/**
 * Generate a unique test identifier to avoid collisions
 */
export function testId(suffix: string): string {
  return `${TEST_PREFIX}_${suffix}`;
}
