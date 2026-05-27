// Code Mode 核心：跑 LLM 写的 JS，暴露 modcrew.* API
//
// 沙箱说明（已知限制）：
//   MV3 SW 没有 V8 isolate 原语，无法严格隔离 chrome.*。
//   依赖两点：(1) 用户自己的 Claude Code 是可信调用方
//             (2) Tool description 强制 modcrew.* 用法
//   未来如需严格沙箱，可考虑 offscreen document + iframe 跑代码。

import { handleSnapshot } from "./snapshot.js";
import { handleFindElement } from "./find-element.js";
import { handleInjectCss } from "./inject-css.js";
import { handleInjectJs } from "./inject-js.js";
import { handleScreenshot } from "./screenshot.js";
import { handleListTabs } from "./list-tabs.js";
import { handleListMods } from "./list-mods.js";
import { handleToggleMod } from "./toggle-mod.js";
import { handleDeleteMod } from "./delete-mod.js";
import { handleSaveMod } from "./save-mod.js";

async function resolveTabId(maybeTabId) {
  if (maybeTabId) return maybeTabId;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

function buildModcrewAPI() {
  return {
    snapshot: async (tabId) => handleSnapshot(await resolveTabId(tabId)),
    findElement: async (intent, tabId) =>
      handleFindElement(await resolveTabId(tabId), intent),
    injectCss: async (css, opts = {}) =>
      handleInjectCss(
        await resolveTabId(opts.tabId),
        css,
        opts.persist,
        opts.urlPattern,
        opts.intent
      ),
    injectJs: async (code, opts = {}) =>
      handleInjectJs(
        await resolveTabId(opts.tabId),
        code,
        opts.persist,
        opts.urlPattern,
        opts.intent
      ),
    screenshot: async (tabId) => handleScreenshot(await resolveTabId(tabId)),
    listTabs: async () => handleListTabs(),
    listMods: async (domain) => handleListMods(domain),
    toggleMod: async (id, enabled) => handleToggleMod(id, enabled),
    deleteMod: async (id) => handleDeleteMod(id),
    saveMod: async (mod) =>
      handleSaveMod(
        await resolveTabId(mod.tabId),
        mod.intent,
        mod.content,
        mod.contentType,
        mod.urlPattern
      ),
  };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function handleExecute(code) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("modcrew_execute requires a non-empty `code` string");
  }
  const modcrew = buildModcrewAPI();
  const fn = new AsyncFunction("modcrew", code);
  // 错误直接抛出 → session.ts 包成 isError:true 给 MCP 客户端
  return await fn(modcrew);
}
