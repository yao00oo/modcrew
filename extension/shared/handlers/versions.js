// History 操作 handlers: listVersions / getVersion / revertTo

import {
  getModById,
  listVersionsForMod,
  getModVersion,
  appendModVersion,
  matchesPattern,
} from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
} from "./user-scripts.js";

export async function handleListVersions(modId) {
  if (!modId) throw new Error("listVersions: modId required");
  const versions = await listVersionsForMod(modId);
  return versions.map((v) => ({
    version: v.version,
    intent: v.intent,
    urlPattern: v.urlPattern,
    author: v.author,
    createdAt: v.createdAt,
    contentPreview: (v.content || "").slice(0, 200),
    contentLength: (v.content || "").length,
  }));
}

export async function handleGetVersion(modId, version) {
  if (!modId) throw new Error("getVersion: modId required");
  if (!version || typeof version !== "number")
    throw new Error("getVersion: version (number) required");
  const v = await getModVersion(modId, version);
  if (!v) throw new Error(`Version ${version} not found on mod ${modId}`);
  return v;
}

// revertTo: 追加一个新 version, content = 指定 version 的 content
// + 同步当前所有匹配 urlPattern 的 open tab: removeCSS 当前 HEAD, insertCSS 新 HEAD
// + JS 走 userScripts re-register
export async function handleRevertTo(modId, version) {
  if (!modId) throw new Error("revertTo: modId required");
  const mod = await getModById(modId);
  if (!mod) throw new Error(`Mod ${modId} not found`);
  if (mod.archivedAt) {
    throw new Error(`Mod ${modId} is archived. restoreMod first.`);
  }
  const target = await getModVersion(modId, version);
  if (!target) throw new Error(`Version ${version} not found`);
  if (mod.currentVersion === version && mod.content === target.content) {
    return { ok: true, modId, version: mod.currentVersion, noop: true };
  }

  const oldContent = mod.content;

  // 追加新 version
  const v = await appendModVersion({
    modId,
    content: target.content,
    intent: `Revert to v${version}` + (target.intent ? ` (${target.intent})` : ""),
    urlPattern: target.urlPattern || mod.urlPattern,
    author: "revert",
  });

  // 同步开着的 tab
  if (mod.type === "css") {
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
        if (oldContent) {
          await chrome.scripting.removeCSS({
            target: { tabId: tab.id },
            css: oldContent,
          });
        }
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          css: target.content,
        });
      } catch {}
    }
  }

  if (mod.type === "js" && mod.useUserScripts && isUserScriptsAvailable()) {
    await registerModAsUserScript({
      ...mod,
      content: target.content,
    });
  }

  return { ok: true, modId, version: v.version, restoredFrom: version };
}
