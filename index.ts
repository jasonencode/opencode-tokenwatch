/**
 * 目录标记 + 服务端插件入口。
 *
 * OpenCode 2.x 有两套本地插件发现：
 * - 服务端（role=server）以 `index.*` 为入口，要求 default 导出为合法插件模块
 * - TUI 侧以 `tui.*` 为入口（见 ./tui.ts）
 *
 * 本文件作为目录发现的标记文件，并导出 dist/server.js 的插件定义。
 */
export { default } from "./dist/server.js"
