# ModCrew V3 — Cloud SSE MCP 架构规范

## 总体目标

```
用户操作：1 个粘贴 + 1 个 Chrome 点击 = 装好可用
LLM 成本：用户自己 Claude Code 订阅（D-001 红线）
我们成本：Cloudflare Worker 转发，~$0/月 (万人量级)
```

---

## 1. 部署拓扑

```
                  api.modcrew.dev (Cloudflare Worker)
                  ┌───────────────────────────────────┐
                  │  /mcp/:token  ← Streamable HTTP    │
                  │  /ws/:token   ← WebSocket          │
                  │  /install     ← HTML 安装页         │
                  │  /api/pair    ← 配对 endpoint       │
                  │                                    │
                  │  Durable Object: ModCrewSession      │
                  │    · 持 extension WebSocket         │
                  │    · 持 MCP SSE controller         │
                  │    · 路由 tool call ↔ tool result  │
                  └───────────────────────────────────┘
                          ↑                ↑
                Streamable HTTP        WebSocket
                          │                │
              ┌───────────┘                └───────────┐
              │                                        │
       [Claude Code]                          [Chrome 扩展]
       本地，用户机器                          本地，用户浏览器
```

**关键约束**：两边都是**出站连接到云**，无需本地端口/NMH/daemon。

---

## 2. URL 设计

| Endpoint | 方法 | 作用 | 谁连 |
|---|---|---|---|
| `/install` | GET | 安装页 HTML | 用户浏览器 |
| `/api/pair` | POST | 生成新 token | 安装页 |
| `/api/status/:token` | GET | 查配对状态 | 调试/重试 |
| `/mcp/:token` | POST | MCP Streamable HTTP | Claude Code |
| `/ws/:token` | GET (upgrade) | WebSocket | Chrome 扩展 |

**Token 在 URL path**：每个用户一个独立 token，路由到独立 Durable Object 实例。

---

## 3. Token & 配对协议

### Token 格式

```
UUID v4，36 字符（带连字符）
例：c4d1e8a3-9b2f-4e7c-a8d9-1f3e7b4c8d2a
```

### 配对流程（绝对最简）

```
Step 1: 用户访问 modcrew.dev/install
   ↓
Step 2: 页面 JS 跑 POST /api/pair → 拿到 token
   ↓
Step 3: 页面显示三块
   ┌─────────────────────────────────────────────┐
   │  ① 复制下面这行到 Claude Code 跑：          │
   │  claude mcp add modcrew --transport http      │
   │    https://api.modcrew.dev/mcp/c4d1e8a3...    │
   │                                             │
   │  ② [Add ModCrew to Chrome] ← 跳 Chrome Store  │
   │                                             │
   │  ③ ↓ 装好扩展后这里会自动变绿 ↓             │
   │     状态：等待扩展配对...                    │
   └─────────────────────────────────────────────┘
   ↓
Step 4: 用户复制粘贴到 Claude Code（① 完成）
        Claude Code 用 mcp add 命令注册 MCP server
   ↓
Step 5: 用户点 Add to Chrome（② 完成）
        装好扩展
   ↓
Step 6: 扩展启动时自动跟 modcrew.dev 页面通讯（externally_connectable）
        拿到当前页面的 token
        连 /ws/:token
        装机页面收到 pong 变绿（③ 完成）
   ↓
完成。Claude Code 现在能调 modcrew 工具。
```

### externally_connectable（关键）

扩展 manifest：
```json
{
  "externally_connectable": {
    "matches": ["https://modcrew.dev/*", "https://www.modcrew.dev/*"]
  }
}
```

modcrew.dev 页面 JS：
```js
// 装好扩展后页面可以直接 message 它（不要权限）
const EXT_ID = "扩展真实 ID";
chrome.runtime.sendMessage(EXT_ID, { type: "pair", token }, (resp) => {
  if (resp?.ok) document.getElementById("status").textContent = "✅ 配对成功";
});
```

扩展 service worker：
```js
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === "pair" && sender.url?.startsWith("https://modcrew.dev")) {
    chrome.storage.local.set({ modcrew_token: msg.token });
    reconnectToCloud();  // 用新 token 连
    sendResponse({ ok: true });
  }
});
```

**唯一标准做法，MetaMask / Brave Rewards 等都这么干。**

---

## 4. MCP 协议（Worker ↔ Claude Code）

### Transport

**Streamable HTTP**（MCP 新标准，比 SSE 简单）：
- POST `/mcp/:token` with JSON-RPC body
- Response：
  - 即时返回的 → `Content-Type: application/json`
  - 流式返回的 → `Content-Type: text/event-stream`

### Initialize

Claude Code 第一次连接发：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": { "name": "claude-code", "version": "..." }
  }
}
```

Worker 回：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "modcrew", "version": "0.3.0" }
  }
}
```

### List Tools

请求：`{ "method": "tools/list" }`

响应：6 个工具的 schema（同 V2 现有定义）

### Call Tool

```
Claude Code → POST /mcp/:token
  { method: "tools/call", params: { name: "browser_inject_css", arguments: {...} } }

Worker：
  · 查 Durable Object（token）
  · 检查 extension WebSocket 是否在线
  · 不在 → 立刻返回 isError: true, "Extension not connected"
  · 在 → 通过 WS 发给扩展，等响应
  · 拿到响应 → 返回给 Claude Code
```

---

## 5. WebSocket 协议（Worker ↔ 扩展）

### 连接

```
GET wss://api.modcrew.dev/ws/:token
Headers: Sec-WebSocket-Version: 13
```

Worker upgrades to WebSocket，路由到 token 对应的 Durable Object。

### 消息格式

**Worker → 扩展（执行工具）**：
```json
{
  "id": "req-uuid",
  "type": "call",
  "tool": "browser_inject_css",
  "args": { "css": "...", "persist": true }
}
```

**扩展 → Worker（工具结果）**：
```json
{
  "id": "req-uuid",
  "type": "result",
  "ok": true,
  "data": { "modId": "..." }
}
```

错误：
```json
{
  "id": "req-uuid",
  "type": "result",
  "ok": false,
  "error": "..."
}
```

### Keepalive

每 20 秒（参考 V2 sw.js 现有逻辑）：

扩展 → Worker：
```json
{ "type": "ping", "ts": 1234567890 }
```

Worker → 扩展：
```json
{ "type": "pong", "ts": 1234567890 }
```

理由：保 SW 不 idle 死（Chrome MV3 限制，参考 docs/mv3-connection-strategy.md）。

---

## 6. Durable Object 设计

### 状态

```ts
class ModCrewSession {
  // 持久（DO 内存中，DO 重启会丢，不持久化到 storage）
  extensionWs: WebSocket | null = null;
  pendingCalls: Map<string, {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  lastActivity: number = Date.now();

  // 入口方法（由 Worker 调用）
  async handleMcpCall(toolName: string, args: any): Promise<any>;
  async handleExtensionConnect(ws: WebSocket): Promise<void>;
  async handleExtensionMessage(raw: string): Promise<void>;
}
```

### 路由

```ts
// worker entry
export default {
  fetch(req, env, ctx) {
    const url = new URL(req.url);
    
    // /install, /api/* → 静态/快速路由，不走 DO
    if (url.pathname === "/install") return serveInstallPage();
    if (url.pathname === "/api/pair") return createToken(env);
    
    // /mcp/:token, /ws/:token → 路由到对应 DO
    const m = url.pathname.match(/^\/(mcp|ws)\/([0-9a-f-]+)/);
    if (m) {
      const token = m[2];
      const doId = env.ModCrewSession.idFromName(token);
      const stub = env.ModCrewSession.get(doId);
      return stub.fetch(req);
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

### DO 内部路由

```ts
fetch(req) {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/ws/")) return this.handleWebSocketUpgrade(req);
  if (url.pathname.startsWith("/mcp/")) return this.handleMcpRequest(req);
}
```

---

## 7. 错误处理

| 场景 | Worker 行为 | 给 Claude Code 看到的 |
|---|---|---|
| 扩展未连接 | 立即返回错误 | `isError: true`, message: "ModCrew extension not paired. Visit modcrew.dev/install" |
| 扩展中途断开 | 已 pending 的全 reject | tool call timeout / error |
| 30s 超时无响应 | 返回超时 | "Extension call timeout" |
| Token 不存在 / 无效格式 | 返回 401 | "Invalid token" |
| 扩展返回 isError | 透传给 Claude Code | 透传 |

---

## 8. 安全考量

| 风险 | 缓解 |
|---|---|
| Token 泄漏 → 攻击者控制用户浏览器 | UUIDv4 高熵；HTTPS only；不在日志打印 |
| 重放攻击 | WebSocket 单连接独占 token（同 token 第二个 WS 连接拒绝） |
| 滥用：刷大量 token | Worker 加 rate limit（IP 维度 + token 维度） |
| DOS Cloudflare DO | DO 有 idle timeout，无活动 30 min 自动卸载 |

V3.0 **不做 token 过期**（保持简单）。V3.1 加 30 天滚动续期。

---

## 9. 成本测算

**Cloudflare 定价（2026 实时）**：

| 资源 | 单价 | 月度配额（每用户） | 成本 |
|---|---|---|---|
| Worker requests | $0.30/M | ~6000 reqs（6 msg/op × 5 ops/天 × 30 天 × 6.6 = 6000） | $0.0018 |
| DO requests | $0.50/M | ~6000 | $0.003 |
| DO compute | $0.0000125/GB-s | ~10 GB-s（idle） | $0.000125 |
| **合计/用户/月** | | | **~$0.005** |

| 用户量 | 月成本 |
|---|---|
| 100 | 免费档（10M reqs/月）内 |
| 1,000 | $5 |
| 10,000 | $50 |
| 100,000 | $500 |

---

## 10. 工程任务清单

| # | 任务 | 估时 |
|---|---|---|
| 1 | Cloudflare Worker scaffold（wrangler init） | 1h |
| 2 | Durable Object: ModCrewSession（WS holder + pending calls） | 4h |
| 3 | `/mcp/:token` Streamable HTTP MCP handler | 6h |
| 4 | `/ws/:token` WebSocket upgrade + 路由 | 2h |
| 5 | `/install` 静态页 + `/api/pair` | 3h |
| 6 | Chrome 扩展：改 BRIDGE_URL → 云端 + token 读取 | 3h |
| 7 | Chrome 扩展：externally_connectable + onMessageExternal | 2h |
| 8 | 端到端测试 | 4h |
| 9 | 部署 wrangler deploy + DNS 配置 | 1h |
| **总计** | | **~26h = 3-4 天** |

---

## 11. 完全新产品 — 不考虑 V2 兼容

V3 是**全新产品**。V2 daemon 代码**不维护**、不删（备份在 modcrew-mcp-v2/）。

V3 不需要支持 V2 用户迁移（V2 没真用户，自用阶段）。

设计上**砍掉所有兼容包袱**：
- 不保留 7788 端口
- 不保留 daemon HTTP 7789
- 不保留 modcrew-mcp 二进制
- 名字、协议全部从零

---

## 12. 未来扩展（V3.1+）

- 跨设备同步 mod（DO 加 storage）
- OAuth 登录 + 多设备配对
- Mod marketplace（分享 / 安装别人的 mod）
- Token 过期 / 滚动续期
- Self-healing：扩展检测 mod 失效自动让 Worker 触发 Claude Code 重生成
