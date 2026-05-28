// archive (soft delete) + restore
//
// archive: mod.archivedAt = now, 从所有 open tab 的当前 CSS 移除, JS unregister userScript
// restore: mod.archivedAt = null, 重新插入 CSS / 重新注册 userScript

import {
  getModById,
  archiveModInStorage,
  restoreModInStorage,
  listArchivedMods,
  matchesPattern,
} from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
  unregisterModAsUserScript,
} from "./user-scripts.js";

export async function handleArchiveMod(id) {
  const mod = await getModById(id);
  if (!mod) throw new Error(`Mod ${id} not found`);
  if (mod.archivedAt) return { ok: true, id, alreadyArchived: true };

  await archiveModInStorage(id);

  // 已开 tab 同步: removeCSS / unregister
  if (mod.type === "css" && mod.content) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      let m = false;
      try {
        m = mod.urlPattern
          ? matchesPattern(tab.url, mod.urlPattern)
          : new URL(tab.url).hostname === mod.domain;
      } catch {
        continue;
      }
      if (!m) continue;
      try {
        await chrome.scripting.removeCSS({
          target: { tabId: tab.id },
          css: mod.content,
        });
      } catch {}
    }
  }

  if (mod.type === "js" && mod.useUserScripts && isUserScriptsAvailable()) {
    try {
      await unregisterModAsUserScript(id);
    } catch {}
  }

  return { ok: true, id };
}

export async function handleRestoreMod(id) {
  const mod = await getModById(id);
  if (!mod) throw new Error(`Mod ${id} not found`);
  if (!mod.archivedAt) return { ok: true, id, alreadyActive: true };

  await restoreModInStorage(id);

  // 重新激活
  if (mod.type === "css" && mod.content && mod.enabled !== false) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      let m = false;
      try {
        m = mod.urlPattern
          ? matchesPattern(tab.url, mod.urlPattern)
          : new URL(tab.url).hostname === mod.domain;
      } catch {
        continue;
      }
      if (!m) continue;
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          css: mod.content,
        });
      } catch {}
    }
  }

  if (mod.type === "js" && mod.useUserScripts && isUserScriptsAvailable()) {
    try {
      await registerModAsUserScript(mod);
    } catch {}
  }

  return { ok: true, id };
}

export async function handleListArchivedMods(domain) {
  const mods = await listArchivedMods(domain);
  return mods.map((m) => ({
    id: m.id,
    domain: m.domain,
    urlPattern: m.urlPattern,
    intent: m.intent,
    type: m.type,
    archivedAt: m.archivedAt,
    contentPreview: (m.content || "").slice(0, 200),
  }));
}
