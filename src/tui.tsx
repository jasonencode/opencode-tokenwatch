/** @jsxImportSource @opentui/solid */
/**
 * TUI 入口 —— OpenCode 2.x CLI 插件。
 *
 * 宿主读取默认导出的 `id` 与 `setup(ctx)`，在 CLI 侧装配侧边栏、命令与事件订阅。
 * 装配期异常必须"可见"：宿主失败时只弹一个不含调用栈的提示，
 * 因此这里捕获异常，用 toast 暴露首行原因，便于定位。
 */
import type { Plugin } from "@opencode/plugin/tui"
import { startTokenWatch } from "./host/runtime.js"
import { createV2Adapter } from "./host/v2/adapter.js"
import { registerV2Commands } from "./host/v2/commands.js"

// `Plugin.define` 只是身份函数；这里用 type-only 导入并直接导出同形状对象，
// 避免运行时把宿主 SDK 及其 @opentui/solid-js peers 一并带入插件目录，
// 造成第二份 OpenTUI 运行时（v0.6.1 在 2.1.3 上失效的根因）。
const plugin: Plugin.Definition = {
  id: "opencode-tokenwatch",
  setup(ctx) {
    try {
      const dispose = new Set<() => void>()
      const host = createV2Adapter(ctx, dispose)
      startTokenWatch(host)
      registerV2Commands(host)
      return () => {
        for (const fn of dispose) {
          try { fn() } catch { /* ignore */ }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? (err.stack ?? err.message).split("\n")[0] : String(err)
      try {
        ctx.ui.toast.show({ message: `TokenWatch setup failed: ${message}`, variant: "error" })
      } catch { /* host may not expose toast */ }
      return () => {}
    }
  },
}

export default plugin
