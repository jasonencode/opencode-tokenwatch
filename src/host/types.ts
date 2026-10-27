/**
 * 宿主能力契约。
 *
 * OpenCode 2.x 的 Plugin Context 在事件模型、插槽命名、主题结构、
 * 命令注册与存储 API 上形态各异，由 host/v2/adapter.ts 折叠为这里的
 * 统一接口。上层 UI / 命令逻辑只依赖本接口，不直接接触宿主 API。
 */
import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import type { UsageFilters, UsageReport } from "../kernel/format.js"

/** 归一化主题色（v2 的嵌套 token 树由 adapter 展平）。 */
export interface ThemeColors {
  readonly primary: RGBA
  readonly textMuted: RGBA
}

/** 归一化消息事件（由 v2 的 step/message 事件折叠而来） */
export interface NormalizedMessageEvent {
  readonly messageID: string
  readonly sessionID: string
  readonly role: string
  readonly providerID: string
  readonly modelID: string
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly total: number
  readonly cost: number
  /** 请求开始时间（epoch ms），供性能追踪计算延迟/TPS */
  readonly timeCreated?: number
  /** 请求完成时间（epoch ms），缺失时性能追踪跳过该样本 */
  readonly timeCompleted?: number
}

/** 归一化 part 事件（用于 TTFT 计时） */
export interface NormalizedPartEvent {
  readonly messageID?: string
  readonly type?: string
  readonly timeStart?: number
}

export interface HostEventHandlers {
  onMessageUpdated(event: NormalizedMessageEvent): void
  onPartUpdated(event: NormalizedPartEvent): void
  /** 消息被删除 / 会话数据失效，UI 应重算 */
  onInvalidate(): void
}

/** 侧边栏渲染入参 */
export interface SidebarInput {
  readonly sessionID: string
}

/** 键值存储（配置与折叠状态） */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  /** 删除条目；宿主未提供时调用方需判空（用于会话消息 KV 淘汰） */
  delete?(key: string): void
}

export interface CommandSpec {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly category?: string
  /** 斜杠命令名（不含前导斜杠） */
  readonly slash?: string
  readonly run: () => void | Promise<void>
}

export interface SelectOption<Value> {
  readonly title: string
  readonly value: Value
  readonly description?: string
}

export type NotifyVariant = "info" | "success" | "warning" | "error"

/**
 * 历史用量数据源。
 *
 * OpenCode 2.x 移除了 `opencode db` 子命令，只能在客户端遍历会话消息重算
 * （慢，需要缓存与首次扫描提示）。
 */
export interface UsageDataSource {
  /**
   * 首次取数是否需要显著耗时（client-scan 恒为 true）。
   * 宿主应在调用前提示用户。
   */
  readonly needsFirstRunNotice: boolean
  /**
   * 本次取数是否会触发冷启动全量扫描。
   */
  readonly isCold: () => boolean
  getUsageReport(filters: UsageFilters): Promise<UsageReport>
}

/** 宿主能力统一抽象 */
export interface HostAdapter {
  theme(): ThemeColors
  store: KeyValueStore

  /** 订阅事件，返回取消订阅函数 */
  subscribe(handlers: HostEventHandlers): () => void

  /** 挂载侧边栏 UI，返回卸载函数 */
  registerSidebar(render: (input: SidebarInput) => JSX.Element): () => void

  /**
   * 注册命令，返回注销函数。
   */
  registerCommands?(specs: readonly CommandSpec[]): () => void

  notify(message: string, variant?: NotifyVariant): void
  select<Value>(input: {
    title: string
    options: readonly SelectOption<Value>[]
  }): Promise<Value | undefined>

  /** 宿主退出 / 插件卸载时调用 */
  onDispose(fn: () => void): void

  /** 当前会话消息列表（用于侧边栏 token 分布估算与历史重建） */
  sessionMessages(sessionID: string): readonly any[]

  /**
   * 指定消息的 part 列表，归一化到内核使用的 part 形状。
   *
   * 传入 sessionID 时走 O(1) 的 `message.get(sessionID, id)`，
   * 避免跨全部会话线性扫描。
   */
  messageParts(messageID: string, sessionID?: string): readonly any[]

  /** 宿主应用配置（读取 agent prompt 用于 system token 估算） */
  appConfig(): Record<string, unknown>

  /** 订阅 part 级更新（用于 token 分布重算），返回取消订阅函数 */
  onPartUpdated(handler: () => void): () => void

  readonly dataSource: UsageDataSource
}
