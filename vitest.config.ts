import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // The snapshot module pulls in the DB client at import time; tests
    // for it should mock the db module, so we don't need a real DB.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/auth.ts",
        "src/lib/auth-client.ts",
        "src/lib/queries.ts",
        "src/lib/demo.ts",
        "src/lib/**/*.test.ts",
      ],
    },
  },
});
