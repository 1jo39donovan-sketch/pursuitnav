import { defineConfig } from "vitest/config";

// Unit tests for plain TypeScript modules (search, formatting). Screens and
// native modules are checked on a device.
export default defineConfig({
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
