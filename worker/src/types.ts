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
      "Inject CSS into the current page. Persists across refresh by default. After injecting, call browser_screenshot to verify it looks right; if not, inject again with corrections — that iterative loop is the intended workflow. Scope the mod narrowly via urlPattern (e.g. 'https://www.youtube.com/watch*' for video pages only, not all of YouTube).",
    inputSchema: {
      type: "object",
      properties: {
        css: { type: "string", description: "Raw CSS to inject." },
        urlPattern: {
          type: "string",
          description:
            "Greasemonkey-style match pattern controlling where the mod auto-applies on future visits. Examples: 'https://www.youtube.com/watch*' (only YouTube video pages), 'https://github.com/*' (entire GitHub), 'https://*/*' (every site). If omitted, defaults to the current tab's full domain — but PREFER narrower patterns when the user's intent only targets specific pages (e.g. only video pages, not the homepage).",
        },
        persist: {
          type: "boolean",
          default: true,
          description:
            "true (default): save the mod and auto-apply on refresh / future matching visits. false: one-shot, dies on refresh.",
        },
        sourceTabId: {
          type: "number",
          description:
            "Optional: another tab's ID. Use this to read style tokens from one tab (via browser_snapshot first) and apply CSS to a different tab — e.g. 'make github.com look like the Vercel dashboard in my other tab'. Without it, the mod applies to the active tab.",
        },
        tabId: { type: "number", description: "Tab to apply CSS to. Omit for active tab." },
      },
      required: ["css"],
    },
  },
  {
    name: "browser_inject_js",
    description:
      "Inject JavaScript into the page. Persists across refresh by default. After injecting, verify by calling browser_screenshot or browser_snapshot — iterate if needed. Scope narrowly via urlPattern.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        urlPattern: {
          type: "string",
          description:
            "Match pattern controlling where to auto-apply. Same syntax as inject_css. Prefer narrow patterns over whole-domain.",
        },
        persist: {
          type: "boolean",
          default: true,
          description:
            "true (default): save and auto-apply on future matching visits. false: one-shot.",
        },
        tabId: { type: "number" },
      },
      required: ["code"],
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Take a screenshot of a tab. Use this after inject_css/inject_js to visually verify your change worked. Also useful to compare two tabs side by side for style transfer.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "browser_list_tabs",
    description:
      "List the user's currently open tabs across all Chrome windows. Returns [{tabId, url, title, active}]. Use this when the user references 'the other tab' or wants to transfer style/structure between tabs — pass tabIds to browser_snapshot / browser_inject_css to operate cross-tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser_list_mods",
    description:
      "List all saved mods (CSS/JS) the user has across every domain. Each entry includes id, domain, urlPattern, intent, type, enabled, content snippet, and createdAt. Use this to answer 'what mods do I have' or to find a specific mod before deleting/toggling it.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Optional: filter to mods for a single domain.",
        },
      },
    },
  },
  {
    name: "browser_toggle_mod",
    description:
      "Enable or disable a saved mod without deleting it. Disabled mods won't auto-apply on page load. Get mod IDs via browser_list_mods.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Mod ID from browser_list_mods." },
        enabled: { type: "boolean" },
      },
      required: ["id", "enabled"],
    },
  },
  {
    name: "browser_delete_mod",
    description:
      "Permanently delete a saved mod. Get IDs via browser_list_mods. The mod will no longer auto-apply on any page.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Mod ID from browser_list_mods." },
      },
      required: ["id"],
    },
  },
  {
    name: "browser_save_mod",
    description:
      "Persist a mod (CSS or JS) to the user's local mod library. Usually you don't need this — inject_css and inject_js already persist by default. Use this when you want to save a mod with a different urlPattern than the current page.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "Short description of what this mod does." },
        content: { type: "string" },
        contentType: { type: "string", enum: ["css", "js"] },
        urlPattern: { type: "string" },
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
