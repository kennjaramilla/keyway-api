import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.spec.ts"],
    // Each e2e file starts its own in-memory MongoDB; the first run downloads the binary.
    hookTimeout: 120_000,
    coverage: { include: ["src/**/*.ts"], exclude: ["src/main.ts", "src/**/*.spec.ts"] },
  },
});
