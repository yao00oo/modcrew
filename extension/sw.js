// ModCrew service worker
// V3 架构（最终版）：扩展是 token 唯一来源
//
// 流程：
//   1. SW 启动 → 读 chrome.storage.modcrew_token
//      · 无 → crypto.randomUUID() 生成 → 存盘
//   2. 用 token 连 wss://api.modcrew.dev/ws/<token>
//   3. popup 从 storage 读 token，显示完整 mcp URL 让用户复制
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
import { handleSnapshot } from "./shared/handlers/snapshot.js";
import { handleFindElement } from "./shared/handlers/find-element.js";
import { handleInjectCss } from "./shared/handlers/inject-css.js";
import { handleInjectJs } from "./shared/handlers/inject-js.js";
import { handleScreenshot } from "./shared/handlers/screenshot.js";
import { handleSaveMod } from "./shared/handlers/save-mod.js";
import { handleListTabs } from "./shared/handlers/list-tabs.js";
import { handleListMods } from "./shared/handlers/list-mods.js";
import { handleToggleMod } from "./shared/handlers/toggle-mod.js";
import { handleDeleteMod } from "./shared/handlers/delete-mod.js";

const KEEPALIVE_MS = 20_000;

let ws = null;
let reconnectDelay = 1000;
let keepaliveTimer = null;
let currentToken = null;

async function ensureToken() {
  const data = await chrome.storage.local.get("modcrew_token");
  if (data.modcrew_token) return data.modcrew_token;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ modcrew_token: fresh });
  console.log("[modcrew] generated new token on first run");
  return fresh;
}

async function regenerateToken() {
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ modcrew_token: fresh });
  if (ws) {
    try { ws.close(); } catch {}
  }
  reconnectDelay = 1000;
  connect();
  return fresh;
}

async function connect() {
  const token = await ensureToken();
  currentToken = token;
  const base = await getApiBase();
  const url = wsUrl(base, token);

  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.warn("[modcrew] ws connect failed:", e);
    scheduleReconnect();
    return;
  }

  ws.addEventListener("open", () => {
    console.log("[modcrew] connected to", base);
    reconnectDelay = 1000;
    startKeepalive();
  });

  ws.addEventListener("close", () => {
    console.log("[modcrew] disconnected");
    ws = null;
    stopKeepalive();
    scheduleReconnect();
  });

  ws.addEventListener("error", (e) => {
    console.warn("[modcrew] ws error:", e);
  });

  ws.addEventListener("message", async (ev) => {
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

async function resolveTabId(args) {
  if (args.tabId) return args.tabId;
  const active = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  return active?.id;
}

async function dispatch(tool, args) {
  // 不需要 tabId 的工具先处理
  if (tool === "browser_list_tabs") return handleListTabs();
  if (tool === "browser_list_mods") return handleListMods(args.domain);
  if (tool === "browser_toggle_mod") return handleToggleMod(args.id, args.enabled);
  if (tool === "browser_delete_mod") return handleDeleteMod(args.id);

  const tabId = await resolveTabId(args);
  if (!tabId) throw new Error("No active tab");

  switch (tool) {
    case "browser_snapshot":
      return handleSnapshot(tabId);
    case "browser_find_element":
      return handleFindElement(tabId, args.intent);
    case "browser_inject_css":
      return handleInjectCss(
        tabId,
        args.css,
        args.persist,
        args.urlPattern,
        args.intent
      );
    case "browser_inject_js":
      return handleInjectJs(
        tabId,
        args.code,
        args.persist,
        args.urlPattern,
        args.intent
      );
    case "browser_screenshot":
      return handleScreenshot(tabId);
    case "browser_save_mod":
      return handleSaveMod(
        tabId,
        args.intent,
        args.content,
        args.contentType,
        args.urlPattern
      );
    default:
      throw new Error(`Unknown tool: ${tool}`);
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

// 内部消息（popup / content script）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "get_status") {
      const { updateInfo } = await chrome.storage.local.get("updateInfo");
      const base = await getApiBase();
      sendResponse({
        connected: ws && ws.readyState === WebSocket.OPEN,
        token: currentToken,
        mcpUrl: currentToken ? `${base}/mcp/${currentToken}` : null,
        apiBase: base,
        update: updateInfo || null,
        version: chrome.runtime.getManifest().version,
      });
    } else if (msg.type === "regenerate_token") {
      const fresh = await regenerateToken();
      const base = await getApiBase();
      sendResponse({ ok: true, token: fresh, mcpUrl: `${base}/mcp/${fresh}` });
    } else if (msg.type === "get_mods_for_url") {
      // content script auto-apply 调用
      const mods = await getModsMatching(msg.url);
      sendResponse(mods);
    } else if (msg.type === "get_mods_for_domain") {
      // 兼容老 content script（如有）
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

maybeCheckUpdate().catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("[modcrew] open side panel failed:", e);
  }
});
