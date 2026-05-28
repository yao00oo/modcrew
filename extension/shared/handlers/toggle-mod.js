import { toggleMod, getModById, matchesPattern } from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
  unregisterModAsUserScript,
} from "./user-scripts.js";

// Toggle 一个 mod。除了改 storage.enabled，还要：
//   - JS user script：取消/重新注册
//   - CSS：从所有"当前 URL 匹配该 mod urlPattern"的开着的 tab 上 remove / 重新 insert，
//     不让用户看到"toggle off 了但页面还蓝"。
export async function handleToggleMod(id, enabled) {
  await toggleMod(id, enabled);
  const mod = await getModById(id);
  if (!mod) return { ok: true, id, enabled };

  // JS user-script 路径
  try {
    if (mod.type === "js" && isUserScriptsAvailable()) {
      if (enabled === false) {
        await unregisterModAsUserScript(id);
      } else if (mod.useUserScripts) {
        await registerModAsUserScript(mod);
      }
    }
  } catch (e) {
    console.warn("[modcrew] userScript toggle failed:", e);
  }

  // CSS：同步现有 tab —— Tweeks 也是这个行为，"取消勾选立刻还原"
  if (mod.type === "css" && mod.content) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      let matches = false;
      try {
        matches = mod.urlPattern
          ? matchesPattern(tab.url, mod.urlPattern)
          : new URL(tab.url).hostname === mod.domain;
      } catch {
        continue;
      }
      if (!matches) continue;
      try {
        if (enabled === false) {
          await chrome.scripting.removeCSS({
            target: { tabId: tab.id },
            css: mod.content,
          });
        } else {
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            css: mod.content,
          });
        }
      } catch (e) {
        // chrome://, edge://, 已关闭等场景会抛，忽略
      }
    }
  }

  return { ok: true, id, enabled };
}
