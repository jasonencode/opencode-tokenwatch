import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { readFileSync } from "node:fs"

/**
 * esbuild build script for opencode-tokenwatch TUI plugin.
 *
 * Bundles src/tui.tsx -> dist/tui.js with SolidJS JSX pre-compiled
 * (JSX -> createComponent calls via esbuild-plugin-solid).
 * Also builds src/server.ts -> dist/server.js (plain JS, no JSX).
 *
 * All runtime deps (solid-js, @opentui/*, @opencode/*) are kept
 * as external imports - the OpenCode 2.x host provides them at runtime.
 */

const external = [
  "solid-js",
  "solid-js/*",
  "@opentui/solid",
  "@opentui/solid/*",
  "@opentui/core",
  "@opentui/core/*",
  "@opentui/keymap",
  "@opentui/keymap/*",
  "@opencode/plugin",
  "@opencode/plugin/*",
  "@opencode/client",
  "@opencode/client/*",
  "@opencode/theme",
  "@opencode/theme/*",
]

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  external,
  logLevel: "info",
}

await Promise.all([
  // TUI module - SolidJS JSX pre-compilation
  build({
    ...common,
    entryPoints: ["src/tui.tsx"],
    outfile: "dist/tui.js",
    plugins: [solidPlugin({
      solid: { moduleName: "@opentui/solid", generate: "universal" },
    })],
  }),
  // Server module - no JSX, no TUI imports (TUI entry is exported separately
  // via package.json exports["./tui"] so the server process never resolves @opentui).
  build({
    ...common,
    entryPoints: ["src/server.ts"],
    outfile: "dist/server.js",
  }),
])

// ── 产物断言：server.js 不得吞下 TUI 代码图（曾因未加 external 而发生过） ──
const serverJs = readFileSync("dist/server.js", "utf-8")
if (serverJs.includes("React.createElement") || /import\s[^;]*["@']@opentui\//.test(serverJs)) {
  console.error("✗ dist/server.js 泄漏了 TUI 代码图（React.createElement 或 @opentui 静态导入）")
  process.exit(1)
}

console.log("✓ esbuild: dist/tui.js + dist/server.js")