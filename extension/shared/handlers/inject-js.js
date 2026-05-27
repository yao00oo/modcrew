import { saveMod } from "../storage.js";

export async function handleInjectJs(tabId, code, persist, urlPattern, intent) {
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

  let modId = null;
  const shouldPersist = persist !== false;
  if (shouldPersist) {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const pattern = urlPattern || `https://${url.hostname}/*`;
    modId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveMod({
      id: modId,
      domain: url.hostname,
      urlPattern: pattern,
      intent: intent || "(inline)",
      type: "js",
      content: code,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  return { ok: true, modId, consoleOutput };
}
