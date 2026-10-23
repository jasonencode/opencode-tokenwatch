/**
 * 上下文窗口占用 —— 对齐 OpenCode 官方 `getSessionContext` 口径。
 *
 * 取当前会话最后一条有效 assistant 消息：
 * `used = input + output + reasoning + cache.read + cache.write`
 * `percent = used / model.limit.context`
 */
import type { TokenMessage } from "./model.js"

export interface ContextUsage {
  readonly providerID: string
  readonly modelID: string
  readonly used: number
  readonly limit: number | undefined
  readonly percent: number | null
}

export function messageTokenTotal(msg: TokenMessage): number {
  return msg.inputTokens + msg.outputTokens + msg.reasoningTokens + msg.cacheRead + msg.cacheWrite
}

export function computeContextUsage(
  messages: readonly TokenMessage[],
  limitOf: (providerID: string, modelID: string) => number | undefined,
): ContextUsage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const used = messageTokenTotal(msg)
    if (used <= 0) continue
    const limit = limitOf(msg.providerID, msg.modelID)
    return {
      providerID: msg.providerID,
      modelID: msg.modelID,
      used,
      limit,
      percent: limit && limit > 0 ? Math.round((used / limit) * 100) : null,
    }
  }
  return undefined
}
