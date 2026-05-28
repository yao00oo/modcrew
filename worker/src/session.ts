// Durable Object：一个 token = 一个独立 session
//
// 持有：
//   · extension 的 WebSocket（最多一个，新连接挤掉旧的）
//   · pending tool 调用（id → resolve）
//
// 入口：
//   · /ws/:token  upgrade 成 WebSocket（extension 连）
//   · /mcp/:token POST JSON-RPC（Claude Code 连）

import type { ExtensionRequest, ExtensionResponse, Env } from "./types.js";
import { TOOLS } from "./types.js";

const TOOL_TIMEOUT_MS = 30_000;

type Pending = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ModCrewSession {
  state: DurableObjectState;
  env: Env;

  extensionWs: WebSocket | null = null;
  pending = new Map<string, Pending>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // /ws/:token  扩展 WebSocket upgrade
    if (path.startsWith("/ws/")) return this.handleWsUpgrade(req);

    // /mcp/:token  Claude Code MCP JSON-RPC POST
    if (path.startsWith("/mcp/")) return this.handleMcpPost(req);

    // /status  调试用
    if (path === "/status") {
      return Response.json({
        extensionConnected: !!this.extensionWs && this.extensionWs.readyState === 1,
        pendingCalls: this.pending.size,
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  // ============== Extension WebSocket ==============

  handleWsUpgrade(req: Request): Response {
    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 挤掉旧连接（同 token 同时只允许一个扩展）
    if (this.extensionWs && this.extensionWs.readyState === 1) {
      try {
        this.extensionWs.close(1000, "Replaced by new connection");
      } catch {}
    }
    this.extensionWs = server;
    server.accept();
    this.attachWsHandlers(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  attachWsHandlers(ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const msg = JSON.parse(raw);

        // keepalive
        if (msg?.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          return;
        }
        if (msg?.type === "pong") return;

        // tool result
        if (msg?.type === "result" && msg.id) {
          const entry = this.pending.get(msg.id);
          if (!entry) return;
          clearTimeout(entry.timeout);
          this.pending.delete(msg.id);
          if (msg.ok) entry.resolve(msg.data);
          else entry.reject(new Error(msg.error ?? "Tool error"));
        }
      } catch (e) {
        console.error("[modcrew] bad ws message:", e);
      }
    });

    ws.addEventListener("close", () => {
      if (this.extensionWs === ws) this.extensionWs = null;
      // 所有 pending 全部 reject
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timeout);
        entry.reject(new Error("Extension disconnected"));
        this.pending.delete(id);
      }
    });
  }

  async callExtension(tool: string, args: any): Promise<any> {
    // MV3 SW 可能正在 sleep (alarm 30s 间隔)，等它醒过来重连 ws，最多等 8s
    if (!this.extensionWs || this.extensionWs.readyState !== 1) {
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (this.extensionWs && this.extensionWs.readyState === 1) break;
      }
    }
    if (!this.extensionWs || this.extensionWs.readyState !== 1) {
      throw new Error(
        "Modcrew extension not connected. Open Chrome (extension SW may be sleeping) and retry — or pair at https://modcrew.dev/install if you removed the extension."
      );
    }
    const id = crypto.randomUUID();
    const req: ExtensionRequest = { id, type: "call", tool, args };

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tool ${tool} timeout after ${TOOL_TIMEOUT_MS}ms`));
      }, TOOL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.extensionWs!.send(JSON.stringify(req));
      } catch (e) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  // ============== MCP (Streamable HTTP) ==============

  async handleMcpPost(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
        { status: 400 }
      );
    }

    const { method, params, id } = body;

    try {
      let result: any;

      if (method === "initialize") {
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "modcrew", version: "1.8.0" },
          instructions: [
            "modcrew lets you modify any website via the user's Chrome extension.",
            "",
            "User-reference heuristics (read this before guessing):",
            '- User says "这里 / 这块 / 这个 / this / that / it" → first call modcrew.getLastPicked(). If nothing picked, ASK the user to click "Pick element" in the popup. Do NOT guess from page text or screenshots.',
            '- User sends an image with no clear instruction ("细节优化", "继续优化"): treat as feedback on what you just did. Compare to your previous modcrew.screenshot. If you have no baseline, snapshot + screenshot now and ASK what specifically should change.',
            "- User mentions a brand/site name that's NOT the active tab (e.g. 'crushon' while on modyolo): call modcrew.listTabs() first to operate on the right tab.",
            "",
            "Iteration:",
            "- modcrew.injectCss now returns a verifyReport. If rulesEffective < rulesChecked, the page's existing CSS is winning. Use the topBlockers info to write more specific selectors (reuse those exact class names + !important).",
            '- User says "再深一点 / 改一下刚才那个 / 调整下": listMods → find recencyHint=last_session → pass that mod\'s id as opts.modId. Never create a duplicate mod for iteration.',
            "",
            "Design quality:",
            "- For visual polish, contrast, typography hierarchy, spacing: if the session has skills like `frontend-design` or `impeccable` available, invoke them. They give you stronger design judgment than relying on prior alone.",
            "- For 'make page X color' requests: prefer (a) reusing the page's own selectors with !important, or (b) `html { filter: hue-rotate(deg) saturate(x) }` for guaranteed coverage. Never just `body { background: X !important }` — it loses to card-class !important.",
            "",
            "Library + Undo:",
            "- Every injectCss/injectJs creates a version. The user can revert from the popup or via modcrew.revertTo(modId, version).",
            "- Delete defaults to soft (archive). Only pass {hard:true} if user explicitly confirms permanent loss.",
          ].join("\n"),
        };
      } else if (method === "notifications/initialized") {
        return new Response(null, { status: 204 }); // notification, no response
      } else if (method === "tools/list") {
        result = { tools: TOOLS };
      } else if (method === "tools/call") {
        const { name, arguments: args } = params;
        try {
          const data = await this.callExtension(name, args ?? {});
          result = {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        } catch (e: any) {
          result = {
            isError: true,
            content: [{ type: "text", text: e?.message ?? String(e) }],
          };
        }
      } else {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${method}` },
            id,
          },
          { status: 404 }
        );
      }

      return Response.json({ jsonrpc: "2.0", result, id });
    } catch (err: any) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: err?.message ?? String(err) },
          id,
        },
        { status: 500 }
      );
    }
  }
}
