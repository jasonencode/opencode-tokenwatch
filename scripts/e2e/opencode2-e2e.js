// 无头端到端验证：node-pty 驱动真实 OpenCode 2.x TUI。
// 使用临时项目目录 + 指向本仓库的 plugins 配置，避免依赖用户全局配置。
const fs = require("fs");
const os = require("os");
const path = require("path");
const pty = require("node-pty");

const ANSI = /(\x1b\[[0-9;?]*[A-Za-z])|(\x1b\][^\x07\x1b]*(\x07|\x1b\\)?)|(\x1b[PX^_][^\x1b]*\x1b\\)|(\x1b[=>NOPc78])|[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
const strip = (s) => s.replace(ANSI, "");

const RESPONSES = [
  [/\x1b\[c/, "\x1b[?61;22c"],
  [/\x1b\[>0?c/, "\x1b[>0;276;0c"],
  [/\x1b\[6n/, "\x1b[1;1R"],
  [/\x1b\[>0q/, "\x1bP>|Microsoft Windows Terminal\x1b\\"],
  [/\x1b\[\?u/, "\x1b[?0u"],
  [/\x1b\[\?2026\$p/, "\x1b[?2026;2$y"],
];

const repoRoot = path.resolve(__dirname, "../..").replace(/\\/g, "/");
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenwatch-e2e-"));
fs.writeFileSync(
  path.join(projectDir, "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugins: [repoRoot],
  }),
);

const isWindows = process.platform === "win32";
const term = pty.spawn(
  isWindows ? "cmd.exe" : "sh",
  isWindows ? ["/c", "opencode"] : ["-c", "opencode"],
  {
    name: "xterm-256color",
    cols: 120,
    rows: 34,
    cwd: projectDir,
    env: process.env,
  },
);

let buf = "";
const answered = [];
term.onData((d) => {
  buf += d;
  for (const [pat, resp] of RESPONSES) {
    if (pat.test(d) && !answered.slice(-4).includes(resp)) {
      answered.push(resp);
      term.write(resp);
    }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    await sleep(25000);
    let v = strip(buf);
    console.log("BOOT:", /Ask anything/.test(v), "| chars:", v.length);
    if (!/Ask anything/.test(v)) {
      console.log("TAIL:", JSON.stringify(v.slice(-500)));
      process.exit(2);
    }

    term.write("/us");
    await sleep(3000);
    v = strip(buf);
    console.log("COMPLETION usage:", /\/usage/.test(v));
    console.log("TAIL_AFTER_US:", JSON.stringify(v.slice(-700)));

    term.write("age");
    await sleep(1500);
    term.write("\r");
    await sleep(8000);
    v = strip(buf);
    console.log("TAIL_AFTER_ENTER:", JSON.stringify(v.slice(-1200)));
    const htmlIdx = v.indexOf("HTML");
    if (htmlIdx >= 0) console.log("MENU_CONTEXT:", JSON.stringify(v.slice(Math.max(0, htmlIdx - 120), htmlIdx + 320)));
    const hits = ["HTML", "JSON"].filter((k) => v.includes(k)).length;
    console.log("MENU_HITS:", hits, "/2");
    console.log("VERDICT:", /\/usage/.test(v) && hits >= 2 ? "PASS" : "CHECK_MANUALLY");
  } catch (e) {
    console.error("ERR:", e);
  } finally {
    try { term.kill(); } catch {}
    setTimeout(() => {
      try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
      process.exit(0);
    }, 1000);
  }
})();
