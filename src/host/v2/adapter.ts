/**
 * v2 宿主适配层：把 OpenCode 2.x 的 `Plugin Context` 折叠为统一 `HostAdapter`。
 *
 * 关键差异（均在此处吸收，上层无感）：
 * - 事件：`session.step.ended` + 内嵌在消息里的 `content`
 * - 插槽：点号路径 `sidebar.content`，且为单对象参数
 * - 主题：嵌套 token 树（`text.base` / `text.muted` / `text.action.*`，旧名回退）
 * - 存储：响应式 `storage.store` + 异步 mutate
 * - 命令：`keymap.layer`
 */
import type { Context } from "@opencode/plugin/tui/context"
import { getUsageReport, isUsageCacheCold, markUsageCacheDirty } from "./data-source.js"
import type {
  HostAdapter,
  HostEventHandlers,
  KeyValueStore,
  NormalizedMessageEvent,
  NormalizedPartEvent,
  NotifyVariant,
  SidebarInput,
  ThemeColors,
  UsageDataSource,
} from "../types.js"

/** v2 主题是嵌套 token 树，映射到内核使用的扁平色 */
function readTheme(ctx: Context): ThemeColors {
  const t = (ctx.theme ?? {}) as any
  // 2.1.3 将 default → base、subdued → muted；保留旧名回退以兼容早期 2.x beta
  const textBase = t?.text?.base ?? t?.text?.default
  const actionPrimary = t?.text?.action?.primary?.base ?? t?.text?.action?.primary?.default
  return {
    primary: actionPrimary ?? textBase,
    textMuted: t?.text?.muted ?? t?.text?.subdued ?? textBase,
  }
}

/**
 * 用宿主响应式 store 实现上层需要的同步 KV 语义。
 *
 * v2 的 `storage.store` 只接受对象初值并提供异步 mutate，
 * 因此这里把所有 kv 键收拢到一个 `values` 映射下面。
 */
function makeStore(ctx: Context): KeyValueStore {
  const [state, mutate] = ctx.storage.store<{ values: Record<string, unknown> }>("tokenwatch", {
    initial: { values: {} },
  })
  return {
    get(key, fallback) {
      try {
        const v = state?.values?.[key]
        return (v === undefined || v === null ? fallback : v) as any
      } catch {
        return fallback
      }
    },
    set(key, value) {
      // mutate 是异步的，但调用方不需要等待落盘；失败不应影响 UI
      void mutate((draft) => {
        draft.values[key] = value
      }).catch(() => {})
    },
    delete(key) {
      void mutate((draft) => {
        delete (draft.values as Record<string, unknown>)[key]
      }).catch(() => {})
    },
  }
}

/** 消息内嵌 content，归一化为内核使用的 part 形状以复用上层分布估算 */
function normalizeParts(message: any): any[] {
  const content = message?.content
  if (!Array.isArray(content)) return []
  const out: any[] = []
  for (const part of content) {
    if (part?.type === "text") {
      out.push({ type: "text", text: part.text ?? "" })
    } else if (part?.type === "reasoning") {
      out.push({ type: "reasoning", text: part.text ?? "" })
    } else if (part?.type === "tool") {
      const st = part.state ?? {}
      out.push({
        type: "tool",
        name: part.name,
        state: {
          status: st.status,
          raw: st.input != null ? JSON.stringify(st.input) : undefined,
          input: st.input,
          // v2 工具输出在 content 数组里，需拼接为字符串
          output: st.status === "completed" ? stringifyToolContent(st.content) : undefined,
          error: st.status === "error" ? String(st.error ?? "") : undefined,
        },
      })
    }
  }
  return out
}

function stringifyToolContent(content: any): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  let out = ""
  for (const item of content) {
    if (typeof item === "string") out += item
    else if (item && typeof item.text === "string") out += item.text
    else if (item?.type === "text" && typeof item?.text === "string") out += item.text
  }
  return out
}

/** step.started 里携带、step.ended 里缺失的元信息（model / 请求起点） */
interface StepMeta {
  providerID: string
  modelID: string
  started?: number
}

/**
 * v2 侧：把 `session.step.ended` + 消息详情折叠为归一化事件。
 *
 * step.ended 自带 tokens/cost/finish，但不含 model / 时间（model 在
 * step.started）。这里以 assistantMessageID 为准回查 assistant 消息；
 * 回查失败时用 step.started 缓存的元信息兜底。
 */
function buildMessageEvent(
  ctx: Context,
  event: any,
  stepMeta: Map<string, StepMeta>,
): NormalizedMessageEvent | null {
  const data = event?.data ?? {}
  const sessionID = data?.sessionID ?? ""
  const messageID = data?.assistantMessageID ?? ""
  const tokens = data?.tokens ?? {}
  const cache = tokens.cache ?? {}
  const message = messageID ? ctx.data.session.message.get(sessionID, messageID) : undefined
  // SessionMessageInfo 是 tagged union：只有 assistant 变体带 model / 时间
  const assistant = message?.type === "assistant" ? message : undefined
  const meta = messageID ? stepMeta.get(messageID) : undefined

  const total =
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (cache.read ?? 0) +
    (cache.write ?? 0)

  return {
    messageID,
    sessionID,
    role: "assistant",
    providerID: assistant?.model?.providerID ?? meta?.providerID ?? "unknown",
    modelID: assistant?.model?.id ?? meta?.modelID ?? "unknown",
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cacheRead: cache.read ?? 0,
    cacheWrite: cache.write ?? 0,
    total,
    cost: typeof data?.cost === "number" ? data.cost : 0,
    // step.ended 事件本身不带时间；从 assistant 消息补齐（性能追踪需要 created/completed）。
    // TPS 的流式终点优先取 time.streamed（provider 响应体接收完毕，剔除收尾
    // settlement 时间），与宿主官方 tok/s 口径一致；缺失时回退 completed / 事件时间。
    timeCreated: assistant?.time?.created ?? meta?.started,
    timeCompleted:
      assistant?.time?.streamed ?? assistant?.time?.completed ?? event?.created,
  }
}

export function createV2Adapter(ctx: Context, dispose: Set<() => void>): HostAdapter {
  let storeRef: KeyValueStore | undefined
  /** 待挂载的 keymap layer 注册动作，由 registerSidebar 在 slot 渲染时执行 */
  let mountKeymapLayer: (() => void) | undefined
  /** step.started → step.ended 之间需要保留的元信息（model / 请求起点） */
  const stepMeta = new Map<string, StepMeta>()

  const clientScanDataSource: UsageDataSource = {
    // v2 没有 `opencode db`，历史统计需遍历会话消息重算，首次必须提示用户
    needsFirstRunNotice: true,
    isCold: () => isUsageCacheCold(),
    getUsageReport: (filters) => getUsageReport(ctx, filters),
  }

  return {
    theme: () => readTheme(ctx),
    get store(): KeyValueStore {
      if (!storeRef) storeRef = makeStore(ctx)
      return storeRef
    },

    subscribe(handlers: HostEventHandlers) {
      const off: Array<() => void> = []

      off.push(
        ctx.data.on("session.step.ended", (event: any) => {
          const normalized = buildMessageEvent(ctx, event, stepMeta)
          if (normalized) {
            stepMeta.delete(normalized.messageID)
            handlers.onMessageUpdated(normalized)
          }
          handlers.onInvalidate()
        }),
      )
      off.push(
        ctx.data.on("session.step.failed", (event: any) => {
          // 失败步不会走 step.ended，清掉兜底元信息避免长期驻留
          const messageID = event?.data?.assistantMessageID
          if (messageID) stepMeta.delete(messageID)
        }),
      )
      // TPS 流式窗口起点（对齐宿主官方 tok/s 口径 output/(streamed−created)）：
      // step.started = LLM 请求起点（reasoning 由此开始流式）。min() 逻辑会
      // 自动取最早锚点，普通模型即 text.started，推理模型即 step/reasoning。
      off.push(
        ctx.data.on("session.step.started", (event: any) => {
          const data = event?.data ?? {}
          if (data.assistantMessageID) {
            // 消息回查失败时的兜底元信息；cap 防止异常会话无限增长
            if (stepMeta.size > 500) stepMeta.clear()
            stepMeta.set(data.assistantMessageID, {
              providerID: data.model?.providerID ?? "unknown",
              modelID: data.model?.id ?? "unknown",
              started: data.started ?? event?.created,
            })
          }
          const part: NormalizedPartEvent = {
            messageID: data.assistantMessageID,
            type: "step",
            timeStart: event?.created,
          }
          handlers.onPartUpdated(part)
        }),
      )
      // 推理/文本 part 的"打开"事件：provider 打开占位符即发（≈ step 起点，
      // 恒早于首 token），只作 TPS 流式窗口锚点，不参与 TTFT
      off.push(
        ctx.data.on("session.reasoning.started", (event: any) => {
          const data = event?.data ?? {}
          const part: NormalizedPartEvent = {
            messageID: data.assistantMessageID,
            type: "part-open",
            timeStart: event?.created,
          }
          handlers.onPartUpdated(part)
        }),
      )
      // 首个内容片段（delta）= 真实"首 token"时刻，用作 TTFT 锚点
      off.push(
        ctx.data.on("session.reasoning.delta", (event: any) => {
          const data = event?.data ?? {}
          const part: NormalizedPartEvent = {
            messageID: data.assistantMessageID,
            type: "reasoning-delta",
            timeStart: event?.created,
          }
          handlers.onPartUpdated(part)
        }),
      )
      off.push(
        ctx.data.on("session.text.delta", (event: any) => {
          const data = event?.data ?? {}
          const part: NormalizedPartEvent = {
            messageID: data.assistantMessageID,
            type: "text-delta",
            timeStart: event?.created,
          }
          handlers.onPartUpdated(part)
        }),
      )
      // 文本 part 打开事件：同 reasoning.started，仅作窗口锚点
      off.push(
        ctx.data.on("session.text.started", (event: any) => {
          const data = event?.data ?? {}
          const part: NormalizedPartEvent = {
            messageID: data.assistantMessageID,
            type: "part-open",
            timeStart: event?.created ?? data.time?.start,
          }
          handlers.onPartUpdated(part)
        }),
      )
      // 注意：2.1.3 的实时事件流（OpenCodeEvent）不包含
      // `session.message.content.updated`（该事件仅走 durable 回放）。
      // 侧边栏在 step.ended / step 事件到达时刷新即可，无需逐 delta 重绘。
      off.push(
        ctx.data.on("session.idle", () => {
          // 空闲 = 一步请求已落库：标记用量缓存脏，下次 /usage 后台重建
          // （stale-while-revalidate，避免报告数据停留在首次扫描时刻）
          markUsageCacheDirty()
          handlers.onInvalidate()
        }),
      )

      const disposeFn = () => {
        for (const fn of off) {
          try { fn() } catch { /* ignore */ }
        }
      }
      return disposeFn
    },

    registerSidebar(render: (input: SidebarInput) => any) {
      // 面板插槽：只负责渲染 TokenWatchPanel
      const offPanel = ctx.ui.slot({
        append: "sidebar.content",
        render: (input: any) => render({ sessionID: input?.sessionID ?? "" }),
      })
      // 命令挂载载体：keymap layer 依赖渲染 owner（见 registerCommands）。
      // prompt.footer 在主屏和会话输入框都会挂载，且不受侧边栏折叠影响；
      // 多会话标签页会挂载多份，宿主按命令 id 去重，重复注册无害。
      const offVehicle = ctx.ui.slot({
        append: "prompt.footer",
        render: () => {
          mountKeymapLayer?.()
          return null
        },
      })
      return () => {
        if (typeof offPanel === "function") offPanel()
        if (typeof offVehicle === "function") offVehicle()
      }
    },

    registerCommands(specs) {
      // 2.1.3 文档允许在 setup 内（含 await 之后）调用 keymap.layer，因此先
      // 直接注册；部分早期 2.x beta 会因 setup 无 Solid owner 抛
      // "Keymap.Provider is missing"，此时退回由 prompt.footer 插槽在组件树
      // 内挂载（见 registerSidebar），两种宿主都能拿到命令。
      let mounted = false
      let reported = false
      const mount = (reportError: boolean) => {
        if (mounted) return
        try {
          ctx.keymap.layer(() => ({
            mode: "global",
            commands: specs.map((spec) => ({
              id: spec.id,
              title: spec.title,
              description: spec.description,
              group: spec.category ?? "Stats",
              palette: true,
              slash: spec.slash ? { name: spec.slash } : undefined,
              run: () => {
                void spec.run()
              },
            })),
          }))
          mounted = true
          mountKeymapLayer = undefined
        } catch (err) {
          // 首次失败是预期的 owner 约束，静默等待 slot 挂载；若挂载仍失败，
          // 必须让用户看到原因（命令静默消失比报错更难排查）。
          if (!reportError || reported) return
          reported = true
          try {
            const message = err instanceof Error ? err.message : String(err)
            ctx.ui?.toast?.show({ message: `TokenWatch commands unavailable: ${message}`, variant: "error" })
          } catch { /* host may not expose toast */ }
        }
      }
      mountKeymapLayer = () => mount(true)
      mount(false)
      return () => {
        mountKeymapLayer = undefined
      }
    },

    notify(message: string, variant: NotifyVariant = "info") {
      try {
        ctx.ui?.toast?.show({ message, variant })
      } catch { /* non-critical */ }
    },

    async select(input) {
      try {
        return await ctx.ui.dialog.select({
          title: input.title,
          options: input.options,
        })
      } catch {
        return undefined
      }
    },

    onDispose(fn: () => void) {
      dispose.add(fn)
    },

    sessionMessages(sessionID: string) {
      try {
        return ctx.data.session.message.list(sessionID) ?? []
      } catch {
        return []
      }
    },

    messageParts(messageID: string, sessionID?: string) {
      try {
        // part 内嵌在消息里；知道所属会话时 O(1) 直取
        if (sessionID) {
          const message = ctx.data.session.message.get(sessionID, messageID)
          if (message) return normalizeParts(message)
        }
        // 回退：跨会话扫描（慢，仅未知会话时使用）
        for (const session of ctx.data.session.list()) {
          const messages = ctx.data.session.message.list(session.id) ?? []
          for (const message of messages) {
            if (message?.id === messageID) return normalizeParts(message)
          }
        }
      } catch { /* fall through */ }
      return []
    },

    appConfig() {
      try {
        const agents = ctx.data.location.agent.list() ?? []
        return { agent: Object.fromEntries(agents.map((a: any) => [a?.name ?? a?.id ?? "default", a])) }
      } catch {
        return {}
      }
    },

    onPartUpdated(handler: () => void) {
      // 2.1.3 无 `session.message.content.updated` 实时事件；用内容增量事件
      // 作为 part 更新信号（调用方已按 ~2Hz 节流）。
      try {
        const off = [
          ctx.data.on("session.text.delta", () => handler()),
          ctx.data.on("session.reasoning.delta", () => handler()),
          ctx.data.on("session.tool.progress", () => handler()),
        ]
        return () => {
          for (const fn of off) {
            try { fn() } catch { /* ignore */ }
          }
        }
      } catch {
        return () => {}
      }
    },

    dataSource: clientScanDataSource,
  }
}
