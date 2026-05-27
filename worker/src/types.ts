// 共享类型定义
//
// MCP 协议：JSON-RPC 2.0
// 扩展协议：自定义 JSON

export type Env = {
  MODCREW_SESSION: DurableObjectNamespace;
};

// === MCP 工具定义（6 个，跟 V2 同步） ===
export const TOOLS = [
  {
    name: "browser_snapshot",
    description:
      "Get a structured snapshot of the current browser tab: URL, title, accessibility tree, and DOM summary. Use this first to understand what's on the page before modifying.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Specific Chrome tab ID. Omit for active tab." },
      },
    },
  },
  {
    name: "browser_find_element",
    description:
      "Find an element on the page by semantic intent (not CSS selector). Returns candidate selectors with confidence scores.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "Semantic description, e.g. '搜索框', 'Tweet compose button'.",
        },
        tabId: { type: "number" },
      },
      required: ["intent"],
    },
  },
  {
    name: "browser_inject_css",
    description:
      "Inject CSS into the current page. Persists across refresh by default — the mod is saved and auto-applied on every future visit to this domain. Pass persist=false only for one-off experiments.",
    inputSchema: {
      type: "object",
      properties: {
        css: { type: "string", description: "Raw CSS to inject." },
        persist: {
          type: "boolean",
          default: true,
          description:
            "true (default): save the mod and auto-apply on refresh / future visits. false: one-shot, dies on refresh.",
        },
        tabId: { type: "number" },
      },
      required: ["css"],
    },
  },
  {
    name: "browser_inject_js",
    description:
      "Inject JavaScript into the page. Persists across refresh by default — the mod is saved and auto-applied on every future visit to this domain. Pass persist=false only for one-off experiments.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        persist: {
          type: "boolean",
          default: true,
          description:
            "true (default): save the mod and auto-apply on refresh / future visits. false: one-shot.",
        },
        tabId: { type: "number" },
      },
      required: ["code"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current visible tab for visual verification.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_save_mod",
    description:
      "Persist a mod (CSS or JS) to the user's local mod library. Auto-applies on future visits.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "Short description of what this mod does." },
        content: { type: "string" },
        contentType: { type: "string", enum: ["css", "js"] },
        tabId: { type: "number" },
      },
      required: ["intent", "content", "contentType"],
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
