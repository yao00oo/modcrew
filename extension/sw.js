// ModCrew service worker — Code Mode (v1.0)
//
// MCP 工具就 2 个：modcrew_search + modcrew_execute
// 所有具体能力在 modcrew.* JS API（execute.js 里的 buildModcrewAPI 暴露）
// 见 docs/mcp-design-principles.md (P1)
//
// MV3 长连接：20s ping + chrome.alarms 30s 兜底

import {
  openDB,
  getModsMatching,
  getModsForDomain,
  getAllMods,
  toggleMod,
  deleteMod,
} from "./shared/storage.js";
import { getApiBase, wsUrl } from "./shared/config.js";
import { maybeCheck as maybeCheckUpdate } from "./shared/update-check.js";
import { handleExecute } from "./shared/handlers/execute.js";
import { handleSearch } from "./shared/handlers/search.js";
import { handleSnapshot } from "./shared/handlers/snapshot.js";
import { handleFindElement } from "./shared/handlers/find-element.js";
import { handleInjectCss } from "./shared/handlers/inject-css.js";
import { handleInjectJs } from "./shared/handlers/inject-js.js";
import { handleScreenshot } from "./shared/handlers/screenshot.js";
import { handleListTabs } from "./shared/handlers/list-tabs.js";
import { handleListMods } from "./shared/handlers/list-mods.js";
import { handleToggleMod } from "./shared/handlers/toggle-mod.js";
import { handleDeleteMod } from "./shared/handlers/delete-mod.js";
import { handleSaveMod } from "./shared/handlers/save-mod.js";

const KEEPALIVE_MS = 20_000;

let ws = null;
let reconnectDelay = 1000;
let keepaliveTimer = null;
let currentToken = null;

async function ensureToken() {
  const data = await chrome.storage.local.get("modcrew_token");
  if (data.modcrew_token) return data.modcrew_token;
  const fresh = crypto.randomUUID();
  // 标记 unverified：只是初始化用的「候选 token」。
  // 用户访问 modcrew.dev 一次后，content/token-sync.js 会跟 localStorage 对帐：
  //   - 如果之前装过（localStorage 里有旧 token），扩展会被 *替换* 成旧 token（恢复 Claude Code 配置）
  //   - 如果是真·首装（localStorage 空），扩展把这个 token 写到 localStorage 作备份，清掉 unverified
  await chrome.storage.local.set({
    modcrew_token: fresh,
    modcrew_token_unverified: true,
  });
  console.log("[modcrew] generated tentative token; awaiting modcrew.dev sync");
  return fresh;
}

async function regenerateToken() {
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({
    modcrew_token: fresh,
    modcrew_token_unverified: false,
  });
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  reconnectDelay = 1000;
  connect();
  return fresh;
}

// 在 modcrew.dev 上跑的 content script 通过 chrome.runtime.sendMessage 调这个
// 决策表：
//   localTok = 网页 localStorage 里的 token (可能 null)
//   swTok    = chrome.storage 里的 token
//   uv       = modcrew_token_unverified (true = 初始化时拍脑袋生成的候选)
//
//   uv=true, localTok 存在 且 ≠ swTok  → 恢复场景：用 localTok 覆盖 swTok，清 uv，重连 WS
//   uv=true, localTok = swTok           → 已同步：清 uv
//   uv=true, localTok 空                → 首装：把 swTok 写到 localStorage，清 uv
//   uv=false, localTok 空               → 备份缺失（之前没访问过 modcrew.dev）：写 localStorage
//   uv=false, localTok ≠ swTok          → 用户主动 regenerate 过：swTok 是权威，覆盖 localStorage
//   uv=false, localTok = swTok          → 稳态：noop
async function handleSyncTokenFromPage(localTok) {
  // 等 ensureToken 把初始 token 写进 storage —— 之前没 await，会有 race
  await ensureToken();
  const data = await chrome.storage.local.get([
    "modcrew_token",
    "modcrew_token_unverified",
  ]);
  const swTok = data.modcrew_token;
  const uv = data.modcrew_token_unverified === true;

  if (!swTok) return { action: "noop" };

  // 恢复场景
  if (uv && localTok && localTok !== swTok) {
    await chrome.storage.local.set({
      modcrew_token: localTok,
      modcrew_token_unverified: false,
    });
    currentToken = localTok;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null; // 关键：同步置空，下面 connect() 才不会跟旧 ws 撞
    }
    reconnectDelay = 1000;
    connect();
    return { action: "noop", restored: true };
  }

  // uv=true, localTok 已是同一个或为空 → 标记 verified，必要时备份
  if (uv) {
    await chrome.storage.local.set({ modcrew_token_unverified: false });
    if (!localTok) return { action: "update_local_storage", token: swTok };
    return { action: "noop" };
  }

  // verified 状态：保 localStorage 和 swTok 一致（regenerate / 缺备份场景）
  if (!localTok || localTok !== swTok) {
    return { action: "update_local_storage", token: swTok };
  }
  return { action: "noop" };
}

async function connect() {
  await ensureToken();
  // 总是从 storage 读最新值（不依赖 ensureToken 的返回，sync 可能刚刚改写了）
  const data = await chrome.storage.local.get("modcrew_token");
  const token = data.modcrew_token;
  if (!token) return;
  currentToken = token;
  const base = await getApiBase();
  const url = wsUrl(base, token);

  let localWs;
  try {
    localWs = new WebSocket(url);
  } catch (e) {
    console.warn("[modcrew] ws connect failed:", e);
    scheduleReconnect();
    return;
  }
  ws = localWs;

  localWs.addEventListener("open", () => {
    if (ws !== localWs) return; // 已经被新连接顶掉了
    console.log("[modcrew] connected to", base);
    reconnectDelay = 1000;
    startKeepalive();
  });

  localWs.addEventListener("close", () => {
    if (ws !== localWs) {
      // 旧 ws 的 close 异步触发，但全局 ws 已经是新的了 — 不要干掉新 ws
      return;
    }
    console.log("[modcrew] disconnected");
    ws = null;
    stopKeepalive();
    scheduleReconnect();
  });

  localWs.addEventListener("error", (e) => {
    console.warn("[modcrew] ws error:", e);
  });

  localWs.addEventListener("message", async (ev) => {
    if (ws !== localWs) return; // 旧 ws 的残留消息
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg?.type === "pong") return;

    if (msg?.type === "call" && msg.id && msg.tool) {
      let response;
      try {
        const data = await dispatch(msg.tool, msg.args || {});
        response = { id: msg.id, type: "result", ok: true, data };
      } catch (e) {
        response = { id: msg.id, type: "result", ok: false, error: e?.message ?? String(e) };
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  });
}

function startKeepalive() {
  stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {}
    }
  }, KEEPALIVE_MS);
}

function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function scheduleReconnect() {
  setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

async function dispatch(tool, args) {
  switch (tool) {
    case "modcrew_search":
      return handleSearch(args.query);
    case "modcrew_execute":
      return handleExecute(args.code);
    default:
      throw new Error(
        `Unknown tool: ${tool}. modcrew v1.0 only exposes modcrew_search + modcrew_execute. ` +
          `If you're using an older mcp config, run: claude mcp remove modcrew && claude mcp add modcrew --transport http <copy URL from extension popup>`
      );
  }
}

// alarm 兜底
chrome.alarms.create("modcrew-keepalive", { delayInMinutes: 0.5, periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "modcrew-keepalive") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {}
    } else {
      console.log("[modcrew] alarm: ws down, reconnecting...");
      reconnectDelay = 1000;
      connect();
    }
  }
});

// modcrew.* API 入口（被 offscreen 转发过来的 sandbox 调用）
async function resolveTabId(maybeTabId) {
  if (maybeTabId) return maybeTabId;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function handleModcrewApiCall(method, args) {
  switch (method) {
    case "snapshot":
      return handleSnapshot(await resolveTabId(args[0]));
    case "findElement":
      return handleFindElement(await resolveTabId(args[1]), args[0]);
    case "injectCss": {
      const [css, opts = {}] = args;
      return handleInjectCss(
        await resolveTabId(opts.tabId),
        css,
        opts.urlPattern,
        opts.intent
      );
    }
    case "injectJs": {
      const [code, opts = {}] = args;
      return handleInjectJs(
        await resolveTabId(opts.tabId),
        code,
        opts.urlPattern,
        opts.intent
      );
    }
    case "screenshot":
      return handleScreenshot(await resolveTabId(args[0]));
    case "listTabs":
      return handleListTabs();
    case "listMods":
      return handleListMods(args[0]);
    case "toggleMod":
      return handleToggleMod(args[0], args[1]);
    case "deleteMod":
      return handleDeleteMod(args[0]);
    case "saveMod": {
      const mod = args[0] || {};
      return handleSaveMod(
        await resolveTabId(mod.tabId),
        mod.intent,
        mod.content,
        mod.contentType,
        mod.urlPattern
      );
    }
    default:
      throw new Error(`Unknown modcrew API method: ${method}`);
  }
}

// 内部消息（popup / content script / offscreen）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "sync_token_from_page") {
      try {
        const result = await handleSyncTokenFromPage(msg.localStorageToken);
        sendResponse(result);
      } catch (e) {
        sendResponse({ action: "noop", error: e?.message ?? String(e) });
      }
      return;
    }
    if (msg.type === "modcrew-api-call") {
      try {
        const result = await handleModcrewApiCall(msg.method, msg.args || []);
        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
      return;
    }
    if (msg.type === "get_status") {
      const { updateInfo, modcrew_token_unverified } = await chrome.storage.local.get([
        "updateInfo",
        "modcrew_token_unverified",
      ]);
      const base = await getApiBase();
      sendResponse({
        connected: ws && ws.readyState === WebSocket.OPEN,
        token: currentToken,
        mcpUrl: currentToken ? `${base}/mcp/${currentToken}` : null,
        apiBase: base,
        unverified: modcrew_token_unverified === true,
        update: updateInfo || null,
        version: chrome.runtime.getManifest().version,
      });
    } else if (msg.type === "regenerate_token") {
      const fresh = await regenerateToken();
      const base = await getApiBase();
      sendResponse({ ok: true, token: fresh, mcpUrl: `${base}/mcp/${fresh}` });
    } else if (msg.type === "get_mods_for_url") {
      const mods = await getModsMatching(msg.url);
      sendResponse(mods);
    } else if (msg.type === "get_mods_for_domain") {
      const mods = await getModsForDomain(msg.domain);
      sendResponse(mods.filter((m) => m.enabled !== false));
    } else if (msg.type === "get_all_mods") {
      const mods = await getAllMods();
      sendResponse(mods);
    } else if (msg.type === "toggle_mod") {
      await toggleMod(msg.id, msg.enabled);
      sendResponse({ ok: true });
    } else if (msg.type === "delete_mod") {
      await deleteMod(msg.id);
      sendResponse({ ok: true });
    } else if (msg.type === "set_api_base") {
      await chrome.storage.local.set({ apiBase: msg.apiBase });
      sendResponse({ ok: true });
    }
  })();
  return true;
});

// 启动
openDB().then(() => connect());

// 启动后尝试自动 sync：如果当前 token 是 unverified（首装 / 重装后初始化），
// 看用户有没有 modcrew.dev tab 开着，有的话注入 content script 跑一次 sync，
// 不用用户手动访问就能恢复。
async function tryAutoSyncOnStart() {
  const data = await chrome.storage.local.get("modcrew_token_unverified");
  if (!data.modcrew_token_unverified) return;
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://modcrew.dev/*", "https://www.modcrew.dev/*"],
    });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/token-sync.js"],
        });
      } catch {}
    }
  } catch {}
}
tryAutoSyncOnStart().catch(() => {});

maybeCheckUpdate().catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("[modcrew] open side panel failed:", e);
  }
});
