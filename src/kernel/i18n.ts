type SupportedLanguage = "zh" | "en"

const zh: Record<string, string> = {
  panelTitle: "TokenWatch",
  input: "输入",
  output: "输出",
  cache: "缓存",
  requests: "请求",
  cost: "成本",
  trendUp: "↑",
  trendDown: "↓",
  tokenDistribution: "Token分布",
  ttft: "TTFT",
  tps: "TPS",
  total: "总计",
  system: "系统提示",
  user: "用户",
  other: "其他",
  toolCall: "Tool调用",
  toolResult: "Tool结果",
  showPerformance: "显示性能指标",
  showPricing: "显示模型定价",
  showTokenDistribution: "显示Token分布",
  showTrend: "显示趋势指示器",
  cmdTitleHtml: "HTML报告",
  cmdDescHtml: "生成交互式HTML仪表盘，展示Token用量、缓存和性能图表",
  cmdTitleJson: "JSON导出",
  cmdDescJson: "导出原始用量数据为JSON文件",
  cmdTitleText: "文本报告",
  cmdDescText: "生成纯文本报告文件",
  cmdTitleSettings: "设置",
  cmdDescSettings: "配置侧边栏显示选项",
  settingsLanguage: "语言",
  settingsTitle: "TokenWatch设置",
  langAuto: "自动",
  done: "完成",
  menuToday: "今天",
  menu7d: "最近 7 天",
  menu30d: "最近 30 天",
  menuAll: "全部时间",
  noticeFirstScan: "首次统计需遍历全部历史会话，可能耗时数秒，请稍候…",
  noticeSkippedSessions: "TokenWatch：{n} 个会话的消息加载失败，已跳过，报告数字可能偏小",
  noticeScanTruncatedSessions: "TokenWatch：会话数超出扫描上限，报告仅包含最近的会话",
  noticeScanTruncatedMessages: "TokenWatch：{n} 个会话的消息数超出上限，其更早的消息未计入",
  toastReportSaved: "报告已保存",
  toastJsonSaved: "JSON 已导出",
  toastError: "出错",
}

const en: Record<string, string> = {
  panelTitle: "TokenWatch",
  input: "Input",
  output: "Output",
  cache: "Cache",
  requests: "Req",
  cost: "Cost",
  trendUp: "↑",
  trendDown: "↓",
  tokenDistribution: "Token Distribution",
  ttft: "TTFT",
  tps: "TPS",
  total: "Total",
  system: "System",
  user: "User",
  other: "Other",
  toolCall: "Tool Call",
  toolResult: "Tool Result",
  showPerformance: "Show Performance",
  showPricing: "Show Pricing",
  showTokenDistribution: "Show Token Distribution",
  showTrend: "Show Trend",
  cmdTitleHtml: "HTML Report",
  cmdDescHtml: "Generate interactive HTML dashboard with token usage, cache, and performance charts",
  cmdTitleJson: "JSON Export",
  cmdDescJson: "Export raw usage data as JSON file",
  cmdTitleText: "Text Report",
  cmdDescText: "Generate plain text report file",
  cmdTitleSettings: "Settings",
  cmdDescSettings: "Configure sidebar display options",
  settingsLanguage: "Language",
  settingsTitle: "TokenWatch Settings",
  langAuto: "Auto",
  done: "Done",
  menuToday: "Today",
  menu7d: "Last 7 Days",
  menu30d: "Last 30 Days",
  menuAll: "All Time",
  noticeFirstScan: "First run scans all historical sessions, this may take a few seconds…",
  noticeSkippedSessions: "TokenWatch: {n} session(s) failed to load and were skipped; report totals may be understated",
  noticeScanTruncatedSessions: "TokenWatch: session count exceeded the scan cap; only the most recent sessions are included",
  noticeScanTruncatedMessages: "TokenWatch: {n} session(s) exceeded the message cap; their older messages are not included",
  toastReportSaved: "Report saved",
  toastJsonSaved: "JSON exported",
  toastError: "Error",
}

let currentLang: SupportedLanguage = detectLanguage()

function detectLanguage(): SupportedLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    if (locale.startsWith("zh")) return "zh"
  } catch {
    // Intl may not be available in restricted environments
  }
  return "en"
}

export function setLanguage(lang: SupportedLanguage | "auto"): void {
  if (lang === "auto") {
    currentLang = detectLanguage()
  } else {
    currentLang = lang
  }
}

export function t(key: string): string {
  const table = currentLang === "zh" ? zh : en
  return table[key] ?? key
}
