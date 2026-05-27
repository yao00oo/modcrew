// 共享类型定义
//
// MCP 协议：JSON-RPC 2.0
// 扩展协议：自定义 JSON
//
// Code Mode (v1.0+): 永远只有 2 个 MCP 工具 — modcrew_search + modcrew_execute。
// 所有具体能力在扩展 SW 暴露的 modcrew.* JS API 里，server-side 加方法无需 client 重配。
// 详见 docs/mcp-design-principles.md (P1)。

export type Env = {
  MODCREW_SESSION: DurableObjectNamespace;
};

// === MCP 工具定义（Code Mode：2 个） ===

const EXECUTE_DESCRIPTION = `Run JavaScript in the user's Chrome via the modcrew extension. Your code has access to one global: \`modcrew\`, with methods for snapshotting tabs, injecting CSS/JS, managing saved mods, and screenshotting.

Quick reference (full docs via modcrew_search):
  modcrew.snapshot(tabId?)
  modcrew.findElement(intent, tabId?)
  modcrew.injectCss(css, opts?)           opts: {tabId, persist=true, urlPattern, intent}
  modcrew.injectJs(code, opts?)           same opts
  modcrew.screenshot(tabId?)
  modcrew.listTabs()
  modcrew.listMods(domain?)
  modcrew.toggleMod(id, enabled)
  modcrew.deleteMod(id)
  modcrew.saveMod({intent, content, contentType, urlPattern, tabId?})

Pass your code as the **body of an async function**. Use \`return\` to send a value back. Wrap each modcrew call with \`await\`.

Example — inject and verify in one tool call:
  const snap = await modcrew.snapshot();
  await modcrew.injectCss('body { background: #2563eb !important }', {
    urlPattern: 'https://www.youtube.com/watch*',
    intent: 'Blue YouTube watch pages'
  });
  return await modcrew.screenshot();

Example — cross-tab style transfer:
  const tabs = await modcrew.listTabs();
  const ref = tabs.find(t => t.url.includes('vercel.com'));
  const refSnap = await modcrew.snapshot(ref.tabId);
  // analyze refSnap, generate CSS, then:
  await modcrew.injectCss(generatedCss, {urlPattern: 'https://github.com/*'});

If your code throws, you'll get the error message and stack — adjust and call again. Iteration is the intended workflow.

Prefer narrow urlPattern (e.g. /watch*) over whole-domain when the user's intent only targets specific pages. persist defaults to true — change only for one-off experiments.`;

const SEARCH_DESCRIPTION = `Look up the modcrew JS API surface. Returns method signatures, options, and examples for everything available inside modcrew_execute. Call this when you forget a method's options or need usage patterns.

If you pass a query, returns matching sections + context. Omit the query to get the full API docs.`;

export const TOOLS = [
  {
    name: "modcrew_search",
    description: SEARCH_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Optional partial method name or keyword to filter docs (e.g. 'injectCss', 'urlPattern', 'tab').",
        },
      },
    },
  },
  {
    name: "modcrew_execute",
    description: EXECUTE_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Async function body. Will run as `(async (modcrew) => { YOUR_CODE })(modcrew)`. Use `await` on every modcrew call. Use `return` to send data back.",
        },
      },
      required: ["code"],
    },
  },
] as const;

// === Worker ↔ Extension WebSocket 消息 ===

export type ExtensionRequest = {
  id: string;
  type: "call";
  tool: string;
  args: any;
};

export type ExtensionResponse =
  | { id: string; type: "result"; ok: true; data: any }
  | { id: string; type: "result"; ok: false; error: string };

export type ExtensionKeepalive =
  | { type: "ping"; ts: number }
  | { type: "pong"; ts: number };
