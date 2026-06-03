import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/test/**",
        "src/config/**",
        "src/index.ts",
        "src/abis.ts",
        "src/types/**",
      ],
      thresholds: {
        lines: 75,
        functions: 55,
        branches: 75,
        statements: 75,
      },
    },
  },
});
