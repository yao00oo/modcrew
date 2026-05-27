# MCP Server 設計原則（活文檔）

> **Last updated**: 2026-05-27
> **Source of truth**: this file at `main` HEAD
> **Use this how**: Before designing or modifying any MCP server, fetch the raw URL of this file. Don't cache, don't rely on training-data prior — the whole point is this file evolves.

## 為什麼是動態文檔，不是 CLAUDE.md 硬編碼

CLAUDE.md 加一條 "用 Code Mode" 一年後會過時 ——
- 新一代客戶端可能修了 `list_changed` cache bug
- 出現更好的 sandbox 模型
- 某個 P 號原則被新工具殺穿

所以 CLAUDE.md 只放一條"先 fetch 這份文檔"，文檔本身在 git 裡演進。每次設計 MCP 前拉 HEAD，**git log** 就是它的演進史。

---

## P1: Code Mode by default — 不要 N 個工具，要 2 個

**規則**: 一個新 MCP server 預設只暴露兩個工具：

```
<server>_search   // 在能力面內搜尋（accepts JS / DSL code）
<server>_execute  // 跑一段 JS 操作真實 API
```

具體 API 在 server-side JS 物件裡（或 sandbox 內的 global），LLM 通過 execute 跑代碼操作。

### 為什麼這樣

1. **Claude Code / Codex 等客戶端 [按 server 名快取 tools/list](https://github.com/anthropics/claude-code/issues/40025)**，server 加新工具客戶端看不見，只能 `mcp remove + add`（用戶煩、開發節奏被卡）
2. **token 占用**: Cloudflare 把 2500+ endpoints 收成 2 個工具，[1.17M → 1k tokens，省 99.9%](https://blog.cloudflare.com/code-mode-mcp/)
3. **多步操作合併**: `execute({code: "await api.snapshot(); await api.inject(...); return await api.screenshot()"})` 一次 tool call 拿完
4. **新功能 zero friction 上線**: server-side JS API 加方法就行，用戶毫無感知

### 證據（讀過的代碼）

Cloudflare 官方 MCP `cloudflare/mcp` 的 `src/server.ts`：

```bash
$ grep -n "registerTool" /tmp/cf-mcp/src/server.ts
417:  server.registerTool('search', ...)
490:  server.registerTool('execute', ...)
512:  server.registerTool('execute', ...)
```

就這 2 個（plus 一個 multi-account 變體）。背後是整個 Cloudflare API surface。

### 何時違反 P1

- Demo / hello-world，永遠只有 1–2 個工具
- 業務面真的小到不會增長（極少見）
- 99% 情況：**別違反**

---

## P2: Credential ownership — 扩展/CLI/server 拿，不要让网页拿

Tokens / API keys / sessions 必须在你能控制的进程里生成并持有（扩展本地 storage、CLI 配置、server R2 等），**绝对不要让网页 fetch /api/pair 生成 token 再推回扩展**。

### Why
两个 token 来源永远会 race。1Password / MetaMask / Bitwarden 一律走 "扩展/原生 app 持有，网页只展示" 模式。

### 證據
ModCrew V3.0 → V3.1 重寫，[commit `dfb3371`](https://github.com/yao00oo/modcrew/commit/dfb3371) 之前坏了多次。

---

## P3: 不要修改 tools/list across versions

如果你不能遵守 P1（Code Mode），那么至少：把 `tools/list` 当作公开 API surface。

- 加新工具 → 必须 URL bump（`/v1/mcp` → `/v2/mcp`），让用户 `claude mcp add` 新 URL
- 改工具 schema → 同上
- 删工具 → 同上

否则用户必须 `claude mcp remove + add`，体验断裂。

### 推论
**遵守 P1 自动解决 P3**：search + execute 永远不变。

---

## P4: Tool description 是 LLM instruction，不是人类 docs

- 用动词式描述：「after injecting, call browser_screenshot to verify」
- 主动引导 agent loop：「if the change didn't take effect, inject again with adjustments」
- 标注反模式：「prefer narrow urlPattern (`/watch*`) over whole-domain」
- 默认值要写：`persist defaults to true; pass false for one-off experiments`

人类看 README，LLM 看 description。两件事。

---

## P5: 中央化部署，客户端无状态

- MCP server 跑在你能 push 的 host（Cloudflare Worker、Fly、Vercel 等）
- 客户端 `~/.claude.json` 只存 URL
- 所有逻辑/工具更新 server-side ship，客户端零操作

### 推论
- Bug fix 用户无感知
- 新功能用户无感知（结合 P1）
- 你能改全用户的体验，他们不用 reinstall

---

## P6: tool 设计从 agent 意图出发，少而灵活

参考 [[feedback-mcp-tool-design]]：少而灵活 > 多而严格；两个相似工具 = 让 LLM 犹豫选错。

### 实操
写完一个工具，**自己 dogfood** 一次：用真实 prompt 走通端到端，看 LLM 调用顺序是否自然、是否在 description 里挣扎。

---

## 开放问题（提 PR / 让用户改）

- Claude Code 修了 `list_changed` 之后，P3 还要不要？
- Code Mode 的 sandbox 在 Chrome extension SW 怎么做（没有 V8 isolate 原语）
- 多 MCP 之间能力组合（GitHub MCP + modcrew MCP 协作）的 best practice

---

## 演进规则

- 任何 commit 都要更新顶部的 `Last updated`
- 每条原则后面尽量带"证据"小节（github link、blog、commit）
- 老原则被推翻 → 不要删，加 `## 已废弃` 章节，写清原因
- 看到更成熟的模式 → 直接 PR，不要怕推翻

## 引用源

- [Cloudflare Code Mode blog (2026)](https://blog.cloudflare.com/code-mode-mcp/)
- [Cloudflare/mcp source code](https://github.com/cloudflare/mcp/blob/main/src/server.ts)
- [Claude Code Issue #40025 — tool list cache bug](https://github.com/anthropics/claude-code/issues/40025)
- [Claude Code Issue #13646 — list_changed unsupported](https://github.com/anthropics/claude-code/issues/13646)
- [Claude Code Issue #17975 — tool caching feature request](https://github.com/anthropics/claude-code/issues/17975)
