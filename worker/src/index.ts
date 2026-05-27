// modcrew worker entry
// V3 架构（最终版）：扩展是 token 唯一来源
//
// 路由：
//   /mcp/:token   POST MCP JSON-RPC（Claude Code 连）
//   /ws/:token    GET  WebSocket upgrade（扩展连）
//   /health       GET  健康检查
//
// 扩展首次启动自己 crypto.randomUUID() 生成 token，
// 直接 WebSocket 上来注册。不再有 /api/pair。

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

    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (pathname === "/health") {
      return cors(Response.json({ ok: true, ts: Date.now() }));
    }

    // /extension[?v=1.0.0]  → 查 GitHub Releases，302 转到 zip
    // 用户端的下载链接保持在 modcrew.dev/api 域下，不暴露 github.com
    if (pathname === "/extension") {
      return handleExtensionDownload(url);
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
      if (resp.webSocket) return resp;
      return cors(resp);
    }

    return cors(new Response("Not Found", { status: 404 }));
  },
};

async function handleExtensionDownload(url: URL): Promise<Response> {
  const wantVersion = url.searchParams.get("v");
  const apiUrl = wantVersion
    ? `https://api.github.com/repos/yao00oo/modcrew/releases/tags/v${wantVersion}`
    : `https://api.github.com/repos/yao00oo/modcrew/releases/latest`;

  const resp = await fetch(apiUrl, {
    headers: {
      "User-Agent": "modcrew-worker",
      Accept: "application/vnd.github+json",
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!resp.ok) {
    return new Response(`GitHub API ${resp.status}`, { status: 502 });
  }
  const data = (await resp.json()) as {
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  };
  const asset = data.assets?.find((a) => a.name?.endsWith(".zip"));
  if (!asset?.browser_download_url) {
    return new Response("No zip asset in release", { status: 404 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: asset.browser_download_url,
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": `attachment; filename="${asset.name}"`,
      "X-Modcrew-Resolved-Version": data.tag_name || "unknown",
    },
  });
}
