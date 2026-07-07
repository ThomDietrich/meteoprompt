import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Absolute paths for the module aliases (Vite/Rollup aliasing wants absolutes).
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyStub = fileURLToPath(
  new URL("./test/stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    // Regex aliases so matching is unambiguous:
    //  - `^server-only$`  → the empty stub (the real pkg throws outside RSC).
    //  - `^@/`            → ./src/  (matches the `@/…` path alias ONLY, never a
    //                       scoped package like `@anthropic-ai/sdk`).
    alias: [
      { find: /^server-only$/, replacement: serverOnlyStub },
      { find: /^@\//, replacement: `${srcDir}/` },
    ],
  },
  test: {
    // Pure functions only — no DOM needed.
    environment: "node",
    // Pins TZ=Europe/Berlin for deterministic locale formatting.
    setupFiles: ["./test/setup.ts"],
  },
});
