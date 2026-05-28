import {
  saveMod,
  getModById,
  appendModVersion,
  createInitialModVersion,
} from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
} from "./user-scripts.js";

// 两条路径（跟 inject-css 对齐）：
//   - 传 modId: 该 mod 追加 version, HEAD 推进, 内容 same → noop
//   - 不传 modId: 新建 mod + v1
//
// JS 还要走 chrome.userScripts.register 做持久化（MV3 native, Chrome 120+）。
// 注意：update 时要先 unregister 再 re-register 用新 content。
export async function handleInjectJs(tabId, code, urlPattern, intent, modId) {
  const wrapped = `(function(){try{${code}}catch(e){console.error('[modcrew] script error:',e);return {error:String(e)}}return {ok:true}})()`;
  let consoleOutput = "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function(`return ${wrapped}`),
      world: "MAIN",
    });
    consoleOutput = JSON.stringify(results?.[0]?.result ?? null);
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }

  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  const pattern = urlPattern || `https://${url.hostname}/*`;

  if (modId) {
    const mod = await getModById(modId);
    if (!mod) throw new Error(`Mod ${modId} not found`);
    if (mod.archivedAt) {
      throw new Error(
        `Mod ${modId} is archived. Call modcrew.restoreMod(${modId}) first.`
      );
    }
    if (mod.type !== "js") {
      throw new Error(`Mod ${modId} is type=${mod.type}, cannot update with JS`);
    }
    if (mod.content === code && (urlPattern == null || mod.urlPattern === pattern)) {
      return { ok: true, modId, version: mod.currentVersion, deduped: true, consoleOutput };
    }
    const v = await appendModVersion({
      modId,
      content: code,
      intent: intent || mod.intent,
      urlPattern: pattern,
      author: "mcp",
    });
    // 重注 userScript（带新 content）
    if (mod.useUserScripts && isUserScriptsAvailable()) {
      await registerModAsUserScript({ ...mod, content: code, urlPattern: pattern });
    }
    return { ok: true, modId, version: v.version, consoleOutput };
  }

  const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const mod = {
    id: newId,
    domain: url.hostname,
    urlPattern: pattern,
    intent: intent || "(inline)",
    type: "js",
    content: code,
    enabled: true,
    currentVersion: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isUserScriptsAvailable()) {
    const ok = await registerModAsUserScript({ ...mod });
    if (ok) mod.useUserScripts = true;
  }

  await saveMod(mod);
  await createInitialModVersion({
    modId: newId,
    content: code,
    intent: intent || "(initial)",
    urlPattern: pattern,
    author: "mcp",
  });
  return {
    ok: true,
    modId: newId,
    version: 1,
    consoleOutput,
    useUserScripts: mod.useUserScripts === true,
  };
}
