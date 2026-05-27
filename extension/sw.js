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

maybeCheckUpdate().catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("[modcrew] open side panel failed:", e);
  }
});
