// Delete mod —— 默认 soft (archive)，opts.hard=true 才真删
import {
  deleteMod,
  getModById,
  matchesPattern,
  deleteAllVersions,
} from "../storage.js";
import { unregisterModAsUserScript } from "./user-scripts.js";
import { handleArchiveMod } from "./archive.js";

export async function handleDeleteMod(id, opts) {
  const mod = await getModById(id);
  if (!mod) return { ok: true, id, notFound: true };
  const hard = opts && opts.hard === true;

  if (!hard) {
    return handleArchiveMod(id);
  }

  // hard delete: 清 CSS + unregister userScript + 删 mod + 删所有 versions
  try {
    if (mod.useUserScripts) await unregisterModAsUserScript(id);
  } catch (e) {
    console.warn("[modcrew] userScript unregister failed:", e);
  }

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

  await deleteAllVersions(id).catch(() => {});
  await deleteMod(id);
  return { ok: true, id, hardDeleted: true };
}
