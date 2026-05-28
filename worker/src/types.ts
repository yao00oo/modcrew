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
  modcrew.injectCss(css, opts?)           opts: {tabId, urlPattern, intent, modId}
  modcrew.injectJs(code, opts?)           same opts
  modcrew.screenshot(tabId?)
  modcrew.fetch(url, opts?)               GET-style cross-origin from SW
  modcrew.listTabs()
  modcrew.listMods(domain?)                each item has versionCount, lastModifiedAt, recencyHint
  modcrew.toggleMod(id, enabled)
  modcrew.deleteMod(id, opts?)             default soft (archive). opts.hard=true = permanent
  // History (v1.7+)
  modcrew.listVersions(modId)
  modcrew.getVersion(modId, version)
  modcrew.revertTo(modId, version)         appends new version with content from that version
  modcrew.archiveMod(id) / restoreMod(id)
  modcrew.listArchivedMods(domain?)
  // Page interaction (v1.4+)
  modcrew.click(selector, tabId?)
  modcrew.fill(selector, value, tabId?)
  modcrew.hover(selector, tabId?)
  modcrew.waitFor(selector, opts?)         opts: {timeoutMs=5000, visible=false, tabId}
  // User intent
  modcrew.getLastPicked()                  → user-picked element selector (popup "Pick element")
  // Cross-session memory
  modcrew.getValue(key, defaultValue?)
  modcrew.setValue(key, value)
  modcrew.deleteValue(key) / modcrew.listValues(prefix?)

PERSISTENCE + VERSION MODEL (read this carefully):
- Every modcrew.injectCss / injectJs is **saved + versioned**. There is NO persist/temporary/preview flag.
- Iteration ("再深一点" / "再调一下" / "改一下刚才那个"):
    1) const mods = await modcrew.listMods(domain);
    2) const target = mods.find(m => m.recencyHint === 'last_session') || mods[0];
    3) await modcrew.injectCss(newCss, { modId: target.id, intent: '...' });
  → appends a new version on the same mod. Don't create a duplicate.
- New different intent ("再加一个 X"): omit modId → new mod.
- Undo: const vs = await modcrew.listVersions(modId); await modcrew.revertTo(modId, vs[1].version);
- "Delete" defaults to soft delete (archive, recoverable). Only pass {hard:true} if user explicitly confirms permanent loss.
- All these are visible to the user in the popup Library: version chain + Restore + Archived tab.

WRITE STRATEGY (a 30%-vs-99% success-rate difference):
- ALWAYS call modcrew.snapshot() first before writing any CSS — read the actual class names on the page. Don't guess.
- Override using selectors copied from the snapshot. \`body { background: X !important }\` LOSES to \`.card { background: white !important }\` because class selectors win on specificity. Reuse the page's own selectors.
- For "make page X color" intents, the most reliable approach is to enumerate stylesheets + per-rule replacement (Dark Reader's pattern). If filter is acceptable, \`html { filter: hue-rotate(220deg) saturate(1.3) }\` is a one-line escape hatch.
- After every inject, call modcrew.screenshot() to verify. If wrong, iterate.

Pass your code as the **body of an async function**. Use \`return\` to send a value back. Wrap each modcrew call with \`await\`.

Example — snapshot, inject, verify in one tool call:
  const snap = await modcrew.snapshot();
  // inspect snap for class names actually present on the page
  await modcrew.injectCss(generatedCss, {
    urlPattern: 'https://www.youtube.com/watch*',
    intent: 'Blue YouTube watch pages'
  });
  return await modcrew.screenshot();

Example — cross-tab style transfer:
  const tabs = await modcrew.listTabs();
  const ref = tabs.find(t => t.url.includes('vercel.com'));
  const refSnap = await modcrew.snapshot(ref.tabId);
  await modcrew.injectCss(generatedCss, {urlPattern: 'https://github.com/*'});

If your code throws, you'll get the error message and stack — adjust and call again.

Prefer narrow urlPattern (e.g. /watch*) over whole-domain when the user's intent only targets specific pages.`;

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
