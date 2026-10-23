/**
 * 会话内单条 assistant 消息的归一化内存模型。
 *
 * 来自 v2 的 `SessionMessageAssistant.tokens`
 * （`{input,output,reasoning,cache:{read,write}}`），在 host/v2/adapter.ts
 * 中折叠为本类型，后续所有聚合逻辑只认这一份结构。
 */

export interface TokenMessage {
  id: string
  sessionID: string
  providerID: string
  modelID: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheRead: number
  cacheWrite: number
  cost: number
}
