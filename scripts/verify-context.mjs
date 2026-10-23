// 上下文口径回归：对齐 OpenCode 官方 getSessionContext。
// 直接打包 kernel/context.ts，避免依赖 dist 的插件入口导出。
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const entry = fileURLToPath(new URL("../src/kernel/context.ts", import.meta.url))
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
})
const code = bundled.outputFiles[0].text
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)

const results = []
const check = (name, cond, extra = "") => {
  results.push(cond)
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`)
}

const msg = (id, tokens, providerID = "p", modelID = "m") => ({
  id,
  sessionID: "s",
  providerID,
  modelID,
  inputTokens: tokens.input ?? 0,
  outputTokens: tokens.output ?? 0,
  reasoningTokens: tokens.reasoning ?? 0,
  cacheRead: tokens.cacheRead ?? 0,
  cacheWrite: tokens.cacheWrite ?? 0,
  cost: 0,
})

const limits = { "p/m": 200000, "q/n": 100000 }
const limitOf = (providerID, modelID) => limits[`${providerID}/${modelID}`]

check("空消息返回 undefined", mod.computeContextUsage([], limitOf) === undefined)

const emptyLast = [
  msg("a1", { input: 100, output: 20, reasoning: 10, cacheRead: 30, cacheWrite: 40 }),
  msg("a2", {}),
]
const skipped = mod.computeContextUsage(emptyLast, limitOf)
check("跳过末尾全零消息", skipped?.used === 200, `used=${skipped?.used}`)
check("used = input+output+reasoning+cacheRead+cacheWrite", skipped?.used === 100 + 20 + 10 + 30 + 40)

const used = mod.computeContextUsage(
  [msg("a1", { input: 1000, output: 200, reasoning: 300, cacheRead: 400, cacheWrite: 100 })],
  limitOf,
)
check("percent = used / limit", used?.percent === 1, `percent=${used?.percent}`)
check("返回消息所属模型", used?.providerID === "p" && used?.modelID === "m")

const noLimit = mod.computeContextUsage([msg("a1", { input: 100 })], () => undefined)
check("上限未知时 percent 为 null", noLimit?.percent === null)

const zeroLimit = mod.computeContextUsage([msg("a1", { input: 100 })], () => 0)
check("上限为 0 时 percent 为 null", zeroLimit?.percent === null)

const multi = mod.computeContextUsage(
  [
    msg("a1", { input: 10 }, "p", "m"),
    msg("a2", { input: 2500, output: 2500 }, "q", "n"),
  ],
  limitOf,
)
check("多模型取最后一条消息", multi?.providerID === "q" && multi?.modelID === "n")
check("多模型使用对应模型上限", multi?.percent === 5, `percent=${multi?.percent}`)

const over = mod.computeContextUsage([msg("a1", { input: 220000 })], limitOf)
check("超过上限不截断", over?.percent === 110, `percent=${over?.percent}`)

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
