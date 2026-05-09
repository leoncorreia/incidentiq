// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
// Use ESM entry explicitly: package "main" points at dist/index.cjs, which require()s Vite 7
// and fails on Node 22+ (ERR_REQUIRE_CYCLE_MODULE) — e.g. Render's Node build.
import { defineConfig } from "@lovable.dev/vite-tanstack-config/dist/index.js";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [nitro()],
  vite: {
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:10000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  },
});
