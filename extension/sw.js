// ModCrew service worker
// V3 架构：扩展 ↔ Cloudflare Worker（wss://api.modcrew.dev/ws/:token）
//
// 跟 V2 的区别：
//   · 不再连 ws://localhost:7788
//   · 连云端 Worker，token 配对
//   · externally_connectable：modcrew.dev 安装页可直接发 token 过来
//
// MV3 SW 长连接策略（同 V2，沿用）：
//   · 20s ping
//   · chrome.alarms 兜底唤醒
//   · 每次 SW 启动重建 alarm

import { openDB, getMods, saveMod } from "./shared/storage.js";
import { getApiBase, wsUrl } from "./shared/config.js";
import { handleSnapshot } from "./shared/handlers/snapshot.js";
import { handleFindElement } from "./shared/handlers/find-element.js";
import { handleInjectCss } from "./shared/handlers/inject-css.js";
import { handleInjectJs } from "./shared/handlers/inject-js.js";
import { handleScreenshot } from "./shared/handlers/screenshot.js";
import { handleSaveMod } from "./shared/handlers/save-mod.js";

const KEEPALIVE_MS = 20_000;

let ws = null;
let reconnectDelay = 1000;
let keepaliveTimer = null;
let currentToken = null;

async function connect() {
  // 读 token
  const data = await chrome.storage.local.get("modcrew_token");
  const token = data.modcrew_token;
  if (!token) {
    console.log("[modcrew] no token yet, waiting for pairing from modcrew.dev/install");
    return;
  }
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

    // Worker 推过来 tool call
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
  const tabId =
    args.tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!tabId) throw new Error("No active tab");

  switch (tool) {
    case "browser_snapshot":
      return handleSnapshot(tabId);
    case "browser_find_element":
      return handleFindElement(tabId, args.intent);
    case "browser_inject_css":
      return handleInjectCss(tabId, args.css, args.persist);
    case "browser_inject_js":
      return handleInjectJs(tabId, args.code, args.persist);
    case "browser_screenshot":
      return handleScreenshot(tabId);
    case "browser_save_mod":
      return handleSaveMod(tabId, args.intent, args.content, args.contentType);
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// === alarm 兜底（同 V2 经验）===
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

// === 接收 modcrew.dev/install 网页发来的 token ===
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const allowedOrigins = [
    "https://modcrew.dev",
    "https://www.modcrew.dev",
    "http://localhost",
  ];
  const ok = allowedOrigins.some((p) => sender.url?.startsWith(p));
  if (!ok) {
    sendResponse({ ok: false, error: "untrusted origin" });
    return;
  }

  if (msg.type === "pair" && msg.token) {
    chrome.storage.local.set({ modcrew_token: msg.token }, () => {
      // 关闭旧连接立即用新 token 重连
      if (ws) {
        try { ws.close(); } catch {}
      }
      reconnectDelay = 1000;
      connect();
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (msg.type === "ping") {
    sendResponse({ ok: true, token: currentToken });
    return;
  }
});

// === 内部消息（panel / content script）===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "get_status") {
      sendResponse({
        connected: ws && ws.readyState === WebSocket.OPEN,
        token: currentToken,
      });
    } else if (msg.type === "get_mods_for_domain") {
      const mods = await getMods(msg.domain);
      sendResponse(mods);
    } else if (msg.type === "set_api_base") {
      // 给 dev 用
      await chrome.storage.local.set({ apiBase: msg.apiBase });
      sendResponse({ ok: true });
    }
  })();
  return true;
});

// === 启动 ===
openDB().then(() => connect());

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("[modcrew] open side panel failed:", e);
  }
});
