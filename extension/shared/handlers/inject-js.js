import { saveMod } from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
} from "./user-scripts.js";

// 每次 inject 都持久化保存（Tweeks 模式）。要撤销走 modcrew.deleteMod。
//
// 双路径：
//   1) chrome.scripting.executeScript({world:'MAIN'}) — 立即在当前 tab 跑（绕 CSP）
//   2) 持久化：优先 chrome.userScripts.register（MV3 native, Chrome 120+, 需用户开 Allow User Scripts）
//      不可用时降级靠 content/auto-apply.js 走 sw round-trip 重注（原 path）
export async function handleInjectJs(tabId, code, urlPattern, intent) {
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
  const modId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mod = {
    id: modId,
    domain: url.hostname,
    urlPattern: pattern,
    intent: intent || "(inline)",
    type: "js",
    content: code,
    enabled: true,
    createdAt: Date.now(),
  };

  // 试着用 chrome.userScripts 注册做持久化，成功就标记
  if (isUserScriptsAvailable()) {
    const ok = await registerModAsUserScript({ ...mod });
    if (ok) mod.useUserScripts = true;
  }

  await saveMod(mod);
  return { ok: true, modId, consoleOutput, useUserScripts: mod.useUserScripts === true };
}
