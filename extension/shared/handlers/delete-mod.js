import { deleteMod, getModById, matchesPattern } from "../storage.js";
import { unregisterModAsUserScript } from "./user-scripts.js";

// 删 mod。除了 storage，还要：
//   - userScripts 注册过的 → 取消
//   - CSS → 从匹配该 mod urlPattern 的开着的 tab 上 removeCSS（立刻还原视觉）
export async function handleDeleteMod(id) {
  const mod = await getModById(id);
  if (!mod) {
    await deleteMod(id);
    return { ok: true, id };
  }

  // userScripts 清理
  try {
    if (mod.useUserScripts) {
      await unregisterModAsUserScript(id);
    }
  } catch (e) {
    console.warn("[modcrew] userScript unregister failed:", e);
  }

  // CSS 从开着的 tab 上移除
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
        await chrome.scripting.removeCSS({
          target: { tabId: tab.id },
          css: mod.content,
        });
      } catch {}
    }
  }

  await deleteMod(id);
  return { ok: true, id };
}
