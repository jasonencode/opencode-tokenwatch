/**
 * Server 入口 —— OpenCode 2.x 插件。
 *
 * 本插件只在 CLI 侧工作（侧边栏 + 命令），服务端不注册任何钩子。
 * 保留一个合法的插件定义，使包主入口（.）可被宿主正常加载；
 * TUI 实现由 package.json 的 exports["./tui"] 单独暴露。
 */
import type { Plugin } from "@opencode/plugin"

// 与 TUI 入口同理：Plugin.define 是身份函数，type-only 导入避免运行时依赖宿主 SDK。
const plugin: Plugin.Plugin = {
  id: "opencode-tokenwatch",
  setup() {
    return () => {}
  },
}

export default plugin
