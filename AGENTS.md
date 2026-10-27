# opencode-tokenwatch — Agent Context Document

> 本文档供 AI 编程助手（opencode CLI、Antigravity CLI 等）快速了解项目全貌。
> 最后更新：2026-10-23（v0.7.0，仅支持 OpenCode 2.x）

---

## 项目概述

**opencode-tokenwatch** 是 [OpenCode CLI](https://github.com/anomalyco/opencode) 的 TUI 插件，为 AI 编程会话提供实时 Token 用量统计、缓存效率分析与性能指标监控。

- **npm 包名**：`@jasonencode/opencode-tokenwatch`
- **上游**：[TTWK/opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)（本仓库为其 fork）
- **插件 id**：`opencode-tokenwatch`（保持不变，兼容既有命令与存储键）
- **版本**：`0.7.0`
- **语言**：TypeScript (ESM)，JSX via SolidJS
- **目标运行环境**：OpenCode CLI 2.x（以 2.1.3 为基线），OpenTUI ≥ 0.6.6
- **构建工具**：`tsc`（类型声明生成）+ `esbuild`（JS 打包，含 SolidJS JSX 预编译）
- **协议**：MIT

---

## 项目结构

```
opencode-tokenwatch/
├── src/                        # 所有源码
│   ├── tui.tsx                 # CLI 插件入口：默认导出 { id, setup(ctx) }（Plugin.Definition）
│   ├── server.ts               # Server 插件入口（合法空插件；TUI 逻辑不进入服务端）
│   ├── kernel/                 # ★ 共享内核：零宿主依赖（无 opentui / 无 opencode 类型）
│   │   ├── model.ts            #   归一化 TokenMessage + 命中率/有效性判定
│   │   ├── format.ts           #   数据格式化 & 全部 TypeScript 类型定义
│   │   ├── i18n.ts             #   国际化（中文/英文/自动检测）
│   │   ├── perf.ts             #   性能追踪（TTFT/TPS/延迟）+ JSONL 日志
│   │   ├── store.ts            #   持久化聚合统计（不受日志轮转影响）
│   │   ├── report.ts           #   报告数据装配 + 落盘（HTML/路径/唯一名）
│   │   ├── report-html.ts      #   HTML 报告生成（ECharts 内嵌）
│   │   └── config.ts           #   侧边栏配置读写（宿主无关）
│   ├── host/                   # ★ 宿主适配层
│   │   ├── types.ts            #   HostAdapter 统一契约
│   │   ├── runtime.tsx         #   启动器：事件 → perf/聚合/KV → 侧边栏
│   │   ├── command-actions.ts  #   报告/设置动作（与菜单实现解耦）
│   │   ├── v2/adapter.ts       #   Plugin Context → HostAdapter
│   │   ├── v2/data-source.ts   #   服务端 API 全量扫描（cursor 翻页；缓存 + 冷启动标记）
│   │   └── v2/commands.ts      #   /usage 菜单（keymap.layer + dialog.select）
│   └── ui/sidebar.tsx          # TokenWatchPanel 组件（仅依赖 HostAdapter）
├── dist/                       # 编译输出（发布到 npm）
├── docs/
│   ├── CODE-REVIEW-2026-09-13.md  # 全项目代码审查报告（含修复跟踪）
│   └── CODE-REVIEW-V2.md          # 历史审查文档
├── assets/                     # 静态资产
├── build.tui.mjs               # esbuild 打包脚本（TSX -> JS，含 SolidJS JSX 预编译）
├── package.json
├── tsconfig.json
├── AGENTS.md                   # 本文档
└── README.md / README.en.md    # 用户文档（中/英）
```

---

## OpenCode 2.x 架构（v0.7.0 起）

只支持 OpenCode 2.x，单包通过两个入口分别服务服务端与 CLI：

```
                   OpenCode 2.x host
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
  package "." → dist/server.js       package "./tui" → dist/tui.js
  { id, setup }（Plugin.Plugin）      { id, setup(ctx) }（Plugin.Definition）
        │                                   │
        │                           createV2Adapter(ctx)
        │                           Plugin Context → HostAdapter
        │                                   ▼
        │                        src/host/runtime.tsx
        │                                   │
        │                    ┌──────────────┼──────────────┐
        │                    ▼              ▼              ▼
        │             src/ui/sidebar   kernel/perf    kernel/store
        │                    │
        │             src/kernel/*（零宿主依赖）
        └─ 服务端仅保留合法空插件，不加载任何 TUI 代码
```

| 维度 | OpenCode 2.x 实现 |
|---|---|
| 模块契约 | 默认导出 `{ id, setup(ctx) }`（`Plugin.Definition` / `Plugin.Plugin`），`id = "opencode-tokenwatch"` |
| 插槽 | `ui.slot({ append: "sidebar.content", render })`，入参 `{ sessionID }` |
| 实时事件 | `session.step.ended`（tokens/cost）、`session.step.started`、`session.text/reasoning.delta`、`session.tool.progress`、`session.idle` |
| 命令 | `keymap.layer`（`{ id, title, slash, run }`）+ `dialog.select` |
| 存储 | `storage.store()` + 异步 `mutate`（Store 同步可读） |
| 主题 | 嵌套 token 树（2.1.3：`text.base` / `text.muted` / `text.action.primary.base`；适配层兼容旧名 `default`/`subdued`） |
| 消息 part | assistant 消息内直接内嵌 `content` |
| 性能口径 | step/reasoning/text 事件锚点 + assistant `time.streamed`（TPS 对齐官方 tok/s） |
| 历史用量 | 无 `opencode db` → `client.session.list`/`message.list` cursor 翻页全量扫描（含更早版本历史；首次提示用户） |

**2.1.3 事件集合注意**：实时事件流（`OpenCodeEvent`）**不包含**
`session.message.content.updated`（该事件只走 durable 回放）。因此不能用它做
流式刷新信号；改为订阅 `session.text.delta` / `session.reasoning.delta` /
`session.tool.progress`（UI 侧已按 ~2Hz 节流）。

**keymap.layer 的 owner 约束**：2.1.3 文档允许在 `setup` 内（含 `await` 之后）
注册 keymap layer，`v2/adapter.ts` 因此先直接注册。部分早期 2.x beta 的
`Keymap.createLayer` 内部会 `useValue()` 读 Keymap Provider 并 `createEffect`，
要求 Solid owner；此时注册抛 "Keymap.Provider is missing"，适配层捕获后
退回 `prompt.footer` 载体插槽，在组件树内、带 owner 时再注册。两条路径均通过
无头回归（直接注册 / owner 受限回退）验证。

**安装/缓存行为**：OpenCode 2.1.3 对 `"plugins": ["包名"]` 优先使用自身
全局缓存（`~/.cache/opencode/npm/<name>@latest/`），不一定读取项目
`node_modules`。升级后若仍加载旧版，会出现 OpenTUI 双运行时的
`OPENTUI_FORCE_UNICODE` 冲突；用 `opencode plugin add/update` 刷新缓存，或本地
开发时在配置里写绝对路径。真实 E2E 用临时项目 + 绝对路径验证打包产物。

**依赖兼容性**：`@opentui/*` 与 `solid-js` 声明为可选 peerDependencies，
运行时由宿主提供；本地仅作为 devDependencies 参与构建。`@opencode/plugin` 只作
devDependency + 可选 peer，入口用 type-only 导入，避免它的非可选 `solid-js`/
`@opentui/*` peers 被安装。v0.6.1 曾把 OpenTUI 放进 `dependencies`，导致与
OpenCode 2.1.3 自带的 OpenTUI 0.6.6 形成第二份运行时，是插件在 2.1.3 上失效的根因之一。

---

## 核心数据流

```
宿主事件 → adapter 归一化 → runtime.tsx (共享启动器)
                        │
                        ├─ onMessageUpdated  → allTokenMessages[] + perf-tracker + KV 持久化
                        ├─ onPartUpdated     → perf-tracker（TTFT 计时）
                        └─ onInvalidate      → 侧边栏重算

allTokenMessages[]  → ui/sidebar.tsx (SolidJS 响应式计算)
                        ├─ modelStats()         按模型聚合 Token/Cost
                        ├─ sessionTotals()      全局总计
                        ├─ modelHitRate()       缓存命中率 per model
                        ├─ modelTrend()         近3次 vs 前3次命中率趋势
                        └─ tokenDistribution()  Token按角色分布（估算）

kernel/perf.ts      → JSONL 日志（~/.opencode/tokenwatch.jsonl，5MB rename 轮转 → .1）
                    │   （KV 持久化带 500ms 写节流 + MRU 索引淘汰，保留最近 20 个会话）
                    → kernel/store.ts（增量累积 tokenwatch-stats.json，
                                    1s 合并落盘 + 原子写；首次读取时从 JSONL 全量迁移）
                    → SessionPerfStats（内存中，session 切换时异步重放 JSONL 恢复）

/usage 命令         → host/v2/data-source.ts（client API cursor 翻页全量扫描，
                                            脏标记 + stale-while-revalidate 缓存）
                    → kernel/report.ts（装配 + 落盘）→ HTML / JSON / Markdown
                    → kernel/report-html.ts（内嵌 ECharts 的独立 HTML，自动打开）

openInBrowser       → spawn detached（不阻塞 TUI）
```

---

## 计算口径参照（对照官方源码，2026-09 复核）

| 指标 | 本插件公式 | 官方参照出处 | 结论 |
|---|---|---|---|
| tokenTotal | input+output+reasoning+cacheRead+cacheWrite（5分量） | `packages/app/src/components/session/session-context-metrics.ts` tokenTotal；`context/data.js` lastAssistantWithUsage | ✓ 一致 |
| 失败过滤 | 五分量合计 = 0 跳过（含 reasoning） | 同上（tokenTotal <= 0 continue） | ✓ |
| cacheHitRate | cacheRead / (cacheRead + input) | `core/session/usage.ts`：input = nonCachedInputTokens | ✓ 分母即全部输入 |
| TPS | output / (time.streamed − 流式窗口起点) | `tui/routes/session/rows.ts` turnTokensPerSecond | ✓（每消息=每 step；窗口起点来自 step.started 事件） |
| TTFT | 首个 reasoning/text **delta** 事件 − step 起点 | part.started 是占位符打开（≈step 起点+0~20ms），delta 才是首 token | ✓ |
| daily 分桶 | 按**本地时区**日期 | 早期 SQL 的 date(...,'localtime') | ✓（曾用 UTC 已修） |
| token 分布 | chars/4 估算（json/code/CJK 修正），output 用真实 tokens | 官方无角色分布；同类插件同为 chars/4 系估算 | ✓ 估算性质（UI 已标注） |
| cost/1K | cost / (i+o+cr+cw) × 1000（混合费率） | 官方 cost 按分段每百万计价 | ✓ 口径成立 |
| Welford/分位数 | kernel/perf-aggregate.ts 单一实现 | — | 三处（perf/store/report）共用 |

---
---

## 关键文件详解

### `src/tui.tsx` — 插件入口

- 默认导出 `{ id: "opencode-tokenwatch", setup(ctx) }`（类型 `Plugin.Definition`；`Plugin.define` 只是身份函数，type-only 导入避免运行时依赖宿主 SDK）
- `setup` 只做装配：`createV2Adapter(ctx)` → `startTokenWatch(host)` → `registerV2Commands(host)`，
  返回统一 dispose；装配异常用 `ctx.ui.toast.show` 暴露首行原因
- `src/host/runtime.tsx` 维护 `allTokenMessages: Signal<TokenMessage[]>`（当前 session 全量消息）
- **无效数据过滤**：`rebuildFromMessages` 加五分量合计 > 0 检查，与事件处理器保持一致
- **session 切换时**：从 KV Store 恢复历史消息，若无则轮询 `sessionMessages()` 重建
- **数据持久化**：消息更新经 500ms 尾沿节流写入 KV（key = `tokenwatch-msgs-{sessionID}`），
  并由 MRU 索引淘汰，仅保留最近 20 个会话的缓存
- 写入时优先使用事件中的 sessionID，避免 slot 渲染时序导致的错存

### `src/ui/sidebar.tsx` — 侧边栏 UI

- 基于 SolidJS 响应式系统，`createMemo` 懒计算
- **模型排序**：按最近调用时间降序（最后一条消息的数组索引），而非 Token 总量或 TPS，切换模型时当前焦点模型始终在顶部
- **供应商名称截断**：超过 12 字符时省略显示（`…`），避免长供应商名撑破布局
- **tokenDistribution**：从消息 parts 估算 Token 分布（chars/4 经验公式）
  - 5 桶：system / user / toolCall / toolResult / output + other 兜底桶，超出真实 input 时比例收缩
- **缓存命中率公式**：`cacheRead / (cacheRead + input)`
- **趋势计算**：最近3次 vs 前3次的命中率差值，需至少6条消息
- **成本展示**：`showPricing` 开启且 `totalCost > 0` 时显示（免费模型不显示，属正常行为）

### `src/kernel/perf.ts` — 性能追踪

- **无效数据过滤**：`handleMessageUpdated` 跳过全零 token 请求，不写 JSONL / stats
- **TTFT**：取最早**可见输出锚点**（`Math.min`）——首个 `*-delta` 事件；
  step / part-open 等"窗口锚点"只参与 TPS 窗口，不参与 TTFT
- **TPS**：`outputTokens / genMs * 1000`；genMs = 流式终点 − 最早**任意** part 起点。
  流式终点优先 assistant `time.streamed`（provider 响应体接收完），起点为
  `session.step.started` —— 与宿主官方 tok/s 口径 `output/(streamed−created)` 一致；
  推理模型的 reasoning 阶段计入分母（此前只锚 text.started 导致 TPS 虚高数倍）；
  无可靠 genMs 时为 null（不使用含排队时间的 fallback）
- **平均值**：Welford 在线均值，分母使用独立的 `ttftCount` / `tpsCount` 计数器
- 每条请求完成后调用 `store.updatePersistedStats(entry)` 写入持久化统计
- 会话内数据存内存；session 切换时 `loadSession()` 异步重放 JSONL 恢复
  （带 loadToken 过期令牌，快速切换不串话）
- JSONL 5MB 时 rename 原子轮转到 `.1`（stats 迁移会一并读取）

### `src/kernel/perf-aggregate.ts` — 聚合核心（三处共用）

- Welford 增量聚合 + Reservoir Sampling（每模型每指标最多 500 样本）+
  线性插值分位数，被 perf（内存）、store（持久化）、report（临时聚合）共用
- `cacheHitRate` 为**百分数**（×100）；`ErrorStats.errorRate` 为**小数**（0~1）

### `src/kernel/store.ts` — 持久化聚合统计

- **存储路径**：`~/.opencode/tokenwatch-stats.json`（临时文件 + rename 原子写）
- **设计目标**：将聚合统计与原始日志完全解耦，JSONL 可以轮转，统计永不丢失
- **合并落盘**：增量先累积在内存副本，至多每 1 秒一次同步写；进程 exit 钩子强制刷盘
- **一次性迁移**：首次 `readPersistedStats()` 自动读取全量 JSONL（含 `.1`）重建历史
- **防重复计数**：迁移时先清空 models 再重建，以 JSONL 为唯一权威来源

### `src/host/v2/data-source.ts` — 客户端扫描数据源

- client API cursor 翻页全量扫描（会话 ≤64 页×500，单会话消息 ≤400 页×200），
  覆盖更早版本留下的历史；截断/跳过经宿主 toast 警告
- **缓存**：同一 TUI 进程复用；`session.idle` 置脏，取数走
  stale-while-revalidate（旧快照立即返回 + 后台重建）
- session 级 model/provider 过滤用会话"首个非 unknown"主模型，
  多模型会话无法按单个模型精确切分（已知近似）

### `src/kernel/report-html.ts` — HTML 报告

- 生成内嵌 ECharts 的独立 HTML 文件，自动在浏览器打开
- **costPer1K 公式**：`cost / (input + output + cacheRead + cacheWrite) * 1000`
- **Efficiency vs Cost 图**：TPS 降序水平条形对比图（含 TTFT、cost/1K 注释），模型名支持最多 50 字符
- **Model Comparison Matrix**：按 token 量堆叠条形图，TPS 以独立菱形散点叠加在右侧 Y 轴
- **Performance Latency Percentiles**：P50/P95/P99 TTFT 及端到端延迟表格
- **Error Rate 卡片 + 失败请求明细表**

---

## 重要数据类型（`src/kernel/format.ts`）

```typescript
interface TokenMessage {          // TUI 内存模型（单条 assistant 消息）
  inputTokens, outputTokens, reasoningTokens, cacheRead, cacheWrite, cost
}

interface SessionTokenData {      // 用量聚合结果
  totalTokens, inputTokens, outputTokens, reasoningTokens, cacheRead, cacheWrite, totalCost
}

interface ModelPerfStats {        // 性能统计（内存 / stats-store / JSONL）
  avgTTFT, avgTPS, avgLatency
  p50TTFT, p95TTFT, p99TTFT
  p50Latency, p95Latency, p99Latency
  ttftCount, tpsCount, latencyCount   // 独立计数分母
  cacheHitRate                        // 该模型加权命中率
}

interface LogEntry {              // JSONL 日志条目格式
  ts, model, providerID, modelID, sessionID
  ttft_ms, tps, latency_ms
  inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, cost
}
```

---

## OpenCode CLI 官方统计方式（对照参考）

> 来源：`anomalyco/opencode` 仓库 `packages/app/src/components/session/`

### 官方 tokenTotal 公式（5分量）

```typescript
const tokenTotal = (msg) =>
  msg.tokens.input + msg.tokens.output + msg.tokens.reasoning
  + msg.tokens.cache.read + msg.tokens.cache.write
```

### 官方 Token 分布（5桶）

| 桶 | 来源 | 估算 |
|---|---|---|
| system | 最后一条 user message 的 system 字段 | chars/4 |
| user | user message 的 text + file.source.text | chars/4 |
| assistant | assistant 的 text + reasoning | chars/4 |
| tool | tool input keys×16 + output/error 长度 | chars/4 |
| other | input - (system+user+assistant+tool) | 直接相减兜底 |

---

## 已知 Bug 修复状态汇总

> 下表为历史记录，"位置"列是 v0.6.0 重构前的文件路径（perf-tracker.ts →
> kernel/perf.ts、stats-store.ts → kernel/store.ts、queries.ts →
> host/v2/data-source.ts、generate-usage-html.ts → kernel/report-html.ts）。
> v1 专用条目仅作历史留存；v0.7.0 起已移除 v1 支持。

| 优先级 | 位置 | 问题描述 | 修复状态 |
|---|---|---|---|
| 🔴 P0 | `perf-tracker.ts` | TTFT 取最后 part 而非最早，应用 `Math.min` | **已修复** |
| 🔴 P0 | `perf-tracker.ts` | 平均值分母用 `requestCount`（总数）而非 `ttftCount` | **已修复** |
| 🔴 P0 | `commands.tsx` | `aggregatePerfStats` 同样的分母 bug | **已修复** |
| 🔴 P0 | `tui.tsx` | `persistToKv` 用 `currentSlotSessionID`，可能存错 session | **已修复** |
| 🔴 P0 | `commands.tsx` | `readLogs(N)` 窗口限制导致历史模型 TPS 数据丢失 | **已修复（引入 stats-store）** |
| 🔴 P0 | `generate-usage-html.ts` | scatter-chart Y 轴模型名被强制截断至 26 字符 | **已修复（50 字符）** |
| 🟡 P1 | `perf-tracker.ts` | TPS fallback 用 latencyMs（含排队时间），严重低估 | **已移除该 fallback** |
| 🟡 P1 | `sidebar.tsx` | assistant text part 未计入 tokenDistribution | **已修复** |
| 🟡 P1 | `sidebar.tsx` | tokenDistribution 缺 `other` 兜底桶 | **已修复** |
| 🟡 P1 | `generate-usage-html.ts` | costPer1K 分母未含 cacheRead | **已修复** |
| 🟡 P1 | `sidebar.tsx` | 模型排序按 Token 总量而非最近调用时间 | **已修复（按最近调用降序）** |
| 🟡 P1 | `sidebar.tsx` | 供应商名称过长撑破布局 | **已修复（12字符截断+省略号）** |
| 🟡 P1 | `perf-tracker.ts` | 全零 token 请求写入日志/统计 | **已修复（跳过无效数据）** |
| 🟡 P1 | `tui.tsx` | 历史重建未过滤全零 token 消息 | **已修复（tokens.total > 0）** |
| 🟡 P1 | `sidebar.tsx` | modelStats 未过滤全零 token | **已修复（二次保障过滤）** |
| 🟡 P1 | `generate-usage-html.ts` | HTML 报告含无效零 token 记录 | **已修复（各渲染函数过滤）** |
| 🟡 P1 | `commands.tsx` | aggregatePerfStats 未跳过全零条目 | **已修复** |

---

## 编码规范与注意事项

### TypeScript / 构建

- **模块系统**：纯 ESM，所有导入必须带 `.js` 扩展名（`.tsx` 源文件的导入也用 `.js`）
- **编译流程**：`npm run build`（= `tsc && node build.tui.mjs`）
  - `tsc`：仅生成 `.d.ts` 类型声明文件（`emitDeclarationOnly: true`）
  - `build.tui.mjs`：esbuild 打包，将 `src/tui.tsx` -> `dist/tui.js`（含 SolidJS JSX 预编译），`src/server.ts` -> `dist/server.js`
- **JSX 预编译**：使用 `esbuild-plugin-solid`，配置 `moduleName: "@opentui/solid"` + `generate: "universal"`，将 JSX 编译为 `createComponent()` 等调用。OpenCode 2.x 不再做运行时 JSX 转换，插件必须在构建时预编译
- **产物在 `dist/`，不提交到 git**
- **JSX**：SolidJS 风格，不是 React。`createSignal`/`createMemo`/`createEffect` 等
- **类型安全**：大量使用 `any` 访问 OpenCode API 事件（API 类型不完整），修改时需谨慎

### Package Exports 结构

```json
{
  ".":       { "import": "./dist/server.js" },        // Server 插件入口
  "./tui":   { "import": "./dist/tui.js" },           // CLI (TUI) 插件入口
  "./server":{ "import": "./dist/server.js" }         // Server 插件（显式路径）
}
```

- OpenCode 2.x 通过 `./tui` 导出自动加载 CLI 插件，无需旧版的 `config.enabled` 元数据
- `./tui` 导出的文件必须是预编译的 `.js`（非 `.jsx`）
- `@opencode/plugin`、`@opentui/*`、`solid-js` 在 esbuild 中保持 external，运行时由宿主解析

### OpenCode 2.x 插件 API（实际使用）

- `ctx.data.on(eventName, handler)` — 订阅实时事件（`session.step.*` / `session.*.delta` / `session.idle`）
- `ctx.data.session.list/get`、`ctx.data.session.message.list/get` — 读取会话与消息
- `ctx.storage.store(key, { initial })` — 持久化存储（`Store` 同步读 + 异步 `mutate`）
- `ctx.ui.toast.show()` — 显示通知
- `ctx.ui.slot({ append, render })` — 注册插槽
- `ctx.keymap.layer(factory)` — 注册命令（2.1.3 可在 `setup` 内直接调用；早期 beta 无 owner 时会抛错，适配层回退到 `prompt.footer` 插槽内注册）
- `ctx.ui.dialog.select/alert` — 交互对话框
- `ctx.client.*` — 服务端 API（历史用量全量扫描）

### 日志与统计文件

| 文件 | 路径 | 格式 | 特点 |
|---|---|---|---|
| JSONL 日志 | `~/.opencode/tokenwatch.jsonl` | 每行一个 JSON | 超过 5MB 时轮转，只保留最新 2000 行 |
| 统计文件 | `~/.opencode/tokenwatch-stats.json` | 单个 JSON | 永久累积，不轮转；含 Reservoir 样本用于分位数计算 |

### i18n

- 支持语言：`zh`（中文）、`en`（英文）、`auto`（系统自动检测）
- 翻译表在 `src/kernel/i18n.ts`，`t(key)` 函数用于取值

---

## 开发工作流

```bash
# 安装依赖
npm install

# 编译（产物在 dist/）
npm run build

# 在 OpenCode 中加载插件（需先 build）
# ~/.opencode/config.json 中配置 plugins
```

---

## 外部依赖

| 依赖 | 用途 |
|---|---|
| `@opencode/plugin` | OpenCode 2.x 插件 API 类型（仅 type-only 导入） |
| `@opentui/core` | TUI 颜色类型（RGBA）/ 渲染类型 |
| `@opentui/solid` | SolidJS TUI 渲染器 |
| `solid-js` | 响应式 UI 框架（通过 @opentui/solid） |
| `esbuild` | JS 打包器，将 TSX 预编译为纯 JS |
| `esbuild-plugin-solid` | esbuild 插件，SolidJS JSX -> createComponent 转换 |

> `@opencode/plugin` 仅作 devDependency + 可选 peer（类型解析用）：`Plugin.define` 是身份函数，
> 入口用 type-only 导入并直接导出同形状对象，避免把宿主 SDK 及其非可选
> `solid-js`/`@opentui/*` peer 带进插件目录（第二份运行时的来源）。`@opentui/*` 与
> `solid-js` 为可选 peerDependencies + devDependencies，运行时由 OpenCode 宿主提供。
> `@opentui/solid@0.6.6` 要求 `solid-js@1.9.12`（本地开发固定该版本）。

---

## 版本历史

### v0.7.0（2026-10-23）

- **fork 发布**：npm 包名改为 `@jasonencode/opencode-tokenwatch`；插件 id 保持 `opencode-tokenwatch`
- **仅支持 OpenCode 2.x**：移除 v1（1.18）适配层、SQL 数据源与 `tui(api)` 入口
- **入口改为 2.x 契约**：默认导出 `{ id, setup(ctx) }`（与 `Plugin.define` 同形状，类型为
  `Plugin.Definition` / `Plugin.Plugin`）；`@opencode/plugin` 仅 type-only 导入，避免运行时
  依赖把宿主 SDK 及其 `solid-js`/`@opentui/*` peers 带进插件目录
- **修复 2.1.3 兼容性**：
  - `@opentui/*` / `solid-js` 从 dependencies 移到可选 peerDependencies（宿主提供），
    避免第二份 OpenTUI 运行时；本地固定 `@opentui 0.6.6` + `solid-js 1.9.12` 构建
  - 主题 token 跟进 2.1.3 重命名（`text.default → text.base`、`text.subdued → text.muted`），
    旧名保留回退
  - 实时事件适配：2.1.3 的 `OpenCodeEvent` 不含 `session.message.content.updated`，
    part 刷新改用 `session.text/reasoning.delta` + `session.tool.progress`
  - assistant 消息 union 收窄（`message.type === "assistant"`）后读取 `model` / `time.streamed`；
    并用 `step.started` 缓存 model/起点作为兜底
- **服务端入口**：`dist/server.js` 只导出合法空插件，不再动态加载 TUI（服务端不解析 @opentui）
- 构建 externals 改为 `@opencode/*`；无头回归与 TPS 回归全部通过

### v0.6.0（2026-09-06，未发布）

- **新增 opencode2 (beta) 完整支持**：共享内核 + 双宿主适配（v1 `tui(api)` / v2 `setup(ctx)`），
  单包同时服务两代宿主；侧边栏、/usage（含 v1 全量历史统计）、性能追踪在 v2 全部可用
- **统计口径对齐官方源码**（v1 `session-context-metrics.ts`、v2 `rows.ts`/`usage.ts`，见上文参照表）：
  - TPS：修复推理模型下虚高数倍（分母剔除 reasoning 阶段），现与宿主 footer 一致
  - TTFT：改用首个内容片段（delta）事件作首 token 锚点（原 part.started 为占位符打开，恒为毫秒级）
  - v2 导出补齐 v1 时期历史（client API cursor 翻页全量扫描，替代客户端 store 局部视图）
  - v2 daily 分桶 UTC → 本地时区，与 v1 报表一致
- **侧边栏**：TPS/TTFT/延迟改为显示**最近一次请求**（与宿主 footer 单次口径可直接对照）
- **内部**：新增 kernel/perf-aggregate.ts 统一三处 Welford/分位数聚合；删除死代码；净 -416 行
- 兼容性：kv 配置键与 tokenwatch-stats.json 格式向后兼容；v1 行为不变

*本文档于 2026-10-23 更新，版本 v0.7.0（仅支持 OpenCode 2.x）。*
