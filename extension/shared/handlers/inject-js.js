import { saveMod } from "../storage.js";

export async function handleInjectJs(tabId, code, persist) {
  // V1: 用 chrome.scripting.executeScript 跑（在 ISOLATED world）
  // 后续可改 chrome.userScripts API 跑 MAIN world 用户脚本
  const wrapped = `(function(){try{${code}}catch(e){console.error('[modly] script error:',e);return {error:String(e)}}return {ok:true}})()`;
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

  let modId = null;
  const shouldPersist = persist !== false;
  if (shouldPersist) {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    modId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveMod({
      id: modId,
      domain: url.hostname,
      urlPattern: `https://${url.hostname}/*`,
      intent: "(inline)",
      type: "js",
      content: code,
      createdAt: Date.now(),
    });
  }

  return { ok: true, modId, consoleOutput };
}
