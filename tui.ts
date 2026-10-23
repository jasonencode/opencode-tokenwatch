/**
 * OpenCode 2.x 目录插件入口：TUI 侧。
 *
 * 以目录形式解析插件时，宿主会把本文件作为入口模块导入并读取 default 导出，
 * 再调用其 `setup(ctx)`。这里直接复用构建产物。
 *
 * 包安装场景走 package.json 的 exports["./tui"]（dist/tui.js），本文件供
 * `.opencode/plugins/` 之类的源码目录发现使用。
 */
export { default } from "./dist/tui.js"
