import { saveMod } from "../storage.js";

// 每次 inject 都持久化保存（Tweeks 模式）。要撤销走 modcrew.deleteMod。
export async function handleInjectCss(tabId, css, urlPattern, intent) {
  await chrome.scripting.insertCSS({ target: { tabId }, css });

  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  const pattern = urlPattern || `https://${url.hostname}/*`;
  const modId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await saveMod({
    id: modId,
    domain: url.hostname,
    urlPattern: pattern,
    intent: intent || "(inline)",
    type: "css",
    content: css,
    enabled: true,
    createdAt: Date.now(),
  });

  return { ok: true, modId };
}
