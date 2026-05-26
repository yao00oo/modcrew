// modcrew worker entry
// 路由：
//   /api/pair          POST 生成新 token（无 auth，简单签发）
//   /api/status/:token GET 查 session 状态
//   /mcp/:token        POST MCP JSON-RPC（路由到 Durable Object）
//   /ws/:token         GET WebSocket upgrade（路由到 Durable Object）
//   /install           GET 静态安装页（暂未实现，先做 worker 端）
//   /health            GET 健康检查

import type { Env } from "./types.js";
export { ModCrewSession } from "./session.js";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    // /health
    if (pathname === "/health") {
      return cors(Response.json({ ok: true, ts: Date.now() }));
    }

    // /api/pair - 生成新 token
    if (pathname === "/api/pair" && req.method === "POST") {
      const token = crypto.randomUUID();
      return cors(Response.json({ token, mcpUrl: `https://${url.host}/mcp/${token}` }));
    }

    // /api/status/:token
    const statusMatch = pathname.match(/^\/api\/status\/([^/]+)$/);
    if (statusMatch && req.method === "GET") {
      const token = statusMatch[1];
      if (!TOKEN_RE.test(token)) {
        return cors(Response.json({ error: "Invalid token" }, { status: 400 }));
      }
      const id = env.MODCREW_SESSION.idFromName(token);
      const stub = env.MODCREW_SESSION.get(id);
      // 转发到 DO 的 /status
      const doUrl = new URL(req.url);
      doUrl.pathname = "/status";
      const r = await stub.fetch(new Request(doUrl.toString(), { method: "GET" }));
      const body = await r.text();
      return cors(new Response(body, { status: r.status, headers: r.headers }));
    }

    // /mcp/:token  /ws/:token  → 路由到 Durable Object
    const sessionMatch = pathname.match(/^\/(mcp|ws)\/([^/]+)/);
    if (sessionMatch) {
      const token = sessionMatch[2];
      if (!TOKEN_RE.test(token)) {
        return cors(new Response("Invalid token format", { status: 400 }));
      }
      const id = env.MODCREW_SESSION.idFromName(token);
      const stub = env.MODCREW_SESSION.get(id);
      const resp = await stub.fetch(req);
      // WebSocket 响应不能 mutate header（has webSocket 字段）
      if (resp.webSocket) return resp;
      return cors(resp);
    }

    // 默认 404
    return cors(new Response("Not Found", { status: 404 }));
  },
};
