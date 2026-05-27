import { saveMod } from "../storage.js";

export async function handleInjectCss(tabId, css, persist, urlPattern, intent) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    css,
  });

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
      type: "css",
      content: css,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  return { ok: true, modId };
}
