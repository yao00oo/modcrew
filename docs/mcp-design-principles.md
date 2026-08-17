# MCP Server 設計原則（活文檔）

> **Last updated**: 2026-08-17
> **上游基准**: [MCP spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)(本文档已对照到此版本;巡检源清单见 [upstream-sources.md](./upstream-sources.md))
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

### 2026-07-28 spec 对 auth 的更替(结论不变,机制更新)
- 客户端注册:OAuth Dynamic Client Registration(RFC7591)**被正式废弃**,改推 [Client ID Metadata Documents](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration#client-id-metadata-documents)——新 server 别再建在 DCR 上
- 客户端 **必须**校验 authorization response 里的 `iss`(RFC 9207),凭据按 issuer 隔离、不得跨 authorization server 复用([SEP-2468](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2468)/[SEP-2352](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2352))
- P2 的核心主张(凭据在你能控制的进程里生成并持有)与新规范方向一致,不变

---

## P3: 不要修改 tools/list across versions

如果你不能遵守 P1（Code Mode），那么至少：把 `tools/list` 当作公开 API surface。

- 加新工具 → 必须 URL bump（`/v1/mcp` → `/v2/mcp`），让用户 `claude mcp add` 新 URL
- 改工具 schema → 同上
- 删工具 → 同上

否则用户必须 `claude mcp remove + add`，体验断裂。

### 推论
**遵守 P1 自动解决 P3**：search + execute 永远不变。

### 2026-07-28 spec 把前提解决了一半(协议层已修,客户端层未验证)
P3 的原始前提是"客户端缓存 tools/list 且感知不到变更"。2026-07-28 正式版在**协议层**给齐了工具:
- `tools/list` 结果**必须**带 `ttlMs` + `cacheScope` 缓存新鲜度提示([SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549))
- 新增 `subscriptions/listen`:客户端显式订阅 `toolsListChanged` 等变更通知(取代旧 GET stream,[SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575))
- 新增 `server/discover`:客户端可按需拉 server 能力

但 **Claude Code 等客户端是否已实现这些**未验证(见开放问题)。在主流客户端跟进之前,P3 照旧执行。

### 顺手的新官方背书
spec 现在建议 `tools/list` 返回**确定性排序**,理由就是提高客户端缓存与 LLM prompt cache 命中率——不搞 Code Mode 的 server 至少把这条做了([changelog minor #3](https://modelcontextprotocol.io/specification/2026-07-28/changelog))。

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

### 2026-07-28 spec 把这条变成了协议官方立场
正式版把整个协议**无状态化**:删掉 session 与 `Mcp-Session-Id`、删掉 `initialize` 握手,协议版本/客户端能力随 `_meta` 每请求携带,server 可以用最普通的 round-robin 负载均衡水平扩([SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567)/[SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575))。跨调用状态用 server 签发的 handle 当普通工具参数传。P5 从"我们的部署偏好"升级为"协议设计方向",照做即可。

---

## P6: tool 设计从 agent 意图出发，少而灵活

参考 [[feedback-mcp-tool-design]]：少而灵活 > 多而严格；两个相似工具 = 让 LLM 犹豫选错。

### 实操
写完一个工具，**自己 dogfood** 一次：用真实 prompt 走通端到端，看 LLM 调用顺序是否自然、是否在 description 里挣扎。

---

## P7: 客户端侧内容(prompt/playbook/定时任务)的分发与更新 — 薄指针 + 包 + 对账

P5 解决的是"MCP server 逻辑更新用户无感知"。但当产品需要把内容装到**客户端侧**
(定时任务的 prompt、playbook、心跳脚本——MCP 够不着的地方),就出现新问题:
装出去的内容怎么更新?2026-07 botook-heartbeat 实战踩出的完整答案:

- **别把全文冻结在客户端**。冻结版安全(运行时不拉远程指令,防注入)但更新永远
  到不了存量用户;发现模板 bug 时只能逐个手动救(实锤翻车:安装注释被粘进运行
  prompt,每次心跳读到"建两个 automation"导致任务繁殖,且无法自动修复)。
- **别自己发明更新通道**。成熟生态全是同一个答案:有包管理器就用包管理器
  (Claude Code plugin marketplace autoUpdate / OpenClaw ClawHub semver+lock.json /
  浏览器扩展签名包);没有的,GitOps 式**每周期对账**:客户端每个循环从它本来
  就要调的 API 返回里读期望版本,漂移即重拉覆盖,收敛 ≤ 1 个周期。
- **分层:护栏在指针层,业务在包层**。本地只留一段基本永不变的薄指针,
  内含不可变护栏(敏感动作拦截),更新永远碰不到它;可变的 playbook 走包/对账。
  更新通道被黑,也只能动业务逻辑、动不了护栏。
- **安装说明与运行 prompt 必须物理分离**。给安装者看的话("建两个任务""替换
  占位符")绝不能进运行 prompt——运行实例会照做。模板用显式分隔线,安装流程
  只允许粘分隔线以下。
- **版本单调只升不降,回滚用 roll-forward**(发 v+1 内容=旧版)。灰度=服务端
  按用户返回不同版本号。

### 与 P3/P5 的关系
同一条反摩擦哲学的第三块拼图:P3 管工具面变更不炸客户端,P5 管 server 逻辑
更新零操作,P7 管"MCP 够不着的客户端内容"更新零操作。三者合起来 = 用户从装完
那天起永远不需要手动更新任何东西。

---

## P8: 跟随 spec 生命周期 — 别建在已废弃特性上

2026-07-28 起 spec 有了正式的[特性生命周期与废弃政策](https://modelcontextprotocol.io/community/feature-lifecycle)(Active/Deprecated/Removed,最短 12 个月废弃窗口)和[已废弃特性注册表](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)。设计新 server 前查一眼注册表,当前已废弃、**新实现不要碰**的:

| 已废弃 | 替代 |
|---|---|
| Roots | 目录/文件走工具参数、resource URI 或 server 配置 |
| Sampling | 直接集成 LLM provider API |
| Logging(`logging/setLevel` 等) | stdio 记 `stderr`,或 OpenTelemetry |
| HTTP+SSE 传输 | Streamable HTTP |
| OAuth DCR(RFC7591) | Client ID Metadata Documents(见 P2) |

新版还带来两个此前不存在的官方形态,设计时优先选它们而不是自造:
- **MRTR**(Multi Round-Trip Requests):server 需要客户端补充输入时,返回 `resultType: "input_required"`,客户端带 `inputResponses` 重试原请求——取代旧的 server 主动发起 `sampling/createMessage`/`elicitation/create`([SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322))
- **Tasks 官方扩展**(`io.modelcontextprotocol/tasks`):长时任务用轮询式 `tasks/get` + `tasks/update`,server 可主动返回 task handle([SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663));通用扩展机制见 [extensions 框架](https://modelcontextprotocol.io/docs/extensions/overview)

### 与本文档演进规则的呼应
spec 的"废弃不删、注册表留痕、12 个月窗口"跟本文档"老原则被推翻加已废弃章节、git log 是演进史"是同一套方法论——上游用它管协议,我们用它管原则。

---

## 开放问题（提 PR / 让用户改）

- ~~Claude Code 修了 `list_changed` 之后，P3 还要不要？~~ → 2026-07-28 spec 已在协议层给齐(`subscriptions/listen` + `ttlMs`,见 P3 补记);问题收窄为:**Claude Code 何时实现新缓存/订阅语义**?实现并验证后,P3 可降级为"兼容旧客户端的建议"
- Code Mode 的 sandbox 在 Chrome extension SW 怎么做（没有 V8 isolate 原语）
- 多 MCP 之间能力组合（GitHub MCP + modcrew MCP 协作）的 best practice
- 无状态化(P5 补记)后,P1 的 server-side JS 会话状态(sandbox 里的变量)如何与"跨调用状态用 server 签发 handle"对齐

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
- [MCP spec 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)(P2/P3/P5/P8 的 2026-08-17 补记来源)
- [MCP 官方博客:The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [已废弃特性注册表](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)
- [Anthropic engineering: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)(P1 同方向的官方论证)
- [Anthropic engineering: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
