import {
  saveMod,
  getModById,
  appendModVersion,
  createInitialModVersion,
  setLastAction,
} from "../storage.js";
import { verifyCss } from "./verify-css.js";

// inject CSS into a tab + persist as mod.
// 两条路径：
//   - 传 modId：在该 mod 上追加新 version (HEAD 推进), 内容跟现 HEAD 一致 → noop
//   - 不传 modId：新建 mod + version 1
export async function handleInjectCss(tabId, css, urlPattern, intent, modId) {
  await chrome.scripting.insertCSS({ target: { tabId }, css });

  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  const pattern = urlPattern || `https://${url.hostname}/*`;

  // 路径 1: modId 提供 → update existing
  if (modId) {
    const mod = await getModById(modId);
    if (!mod) throw new Error(`Mod ${modId} not found`);
    if (mod.archivedAt) {
      throw new Error(
        `Mod ${modId} is archived. Call modcrew.restoreMod(${modId}) first.`
      );
    }
    if (mod.type !== "css") {
      throw new Error(`Mod ${modId} is type=${mod.type}, cannot update with CSS`);
    }
    // 字面去重：内容跟 HEAD 完全一样 → noop
    if (mod.content === css && (urlPattern == null || mod.urlPattern === pattern)) {
      return {
        ok: true,
        modId,
        version: mod.currentVersion,
        deduped: true,
      };
    }
    const v = await appendModVersion({
      modId,
      content: css,
      intent: intent || mod.intent,
      urlPattern: pattern,
      author: "mcp",
    });
    const verifyReport = await verifyCss(tabId, css);
    await setLastAction({
      type: "injectCss",
      modId,
      version: v.version,
      previousVersion: mod.currentVersion,
      intent: intent || mod.intent,
      domain: url.hostname,
      urlPattern: pattern,
    });
    return { ok: true, modId, version: v.version, verifyReport };
  }

  // 路径 2: 无 modId → 新建 mod + v1
  const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  await saveMod({
    id: newId,
    domain: url.hostname,
    urlPattern: pattern,
    intent: intent || "(inline)",
    type: "css",
    content: css,
    enabled: true,
    currentVersion: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await createInitialModVersion({
    modId: newId,
    content: css,
    intent: intent || "(initial)",
    urlPattern: pattern,
    author: "mcp",
  });
  const verifyReport = await verifyCss(tabId, css);
  await setLastAction({
    type: "injectCss",
    modId: newId,
    version: 1,
    previousVersion: null, // 新建 mod，undo = archive
    intent: intent || "(initial)",
    domain: url.hostname,
    urlPattern: pattern,
  });
  return { ok: true, modId: newId, version: 1, verifyReport };
}
