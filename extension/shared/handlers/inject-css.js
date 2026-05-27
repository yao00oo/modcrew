import { saveMod } from "../storage.js";

export async function handleInjectCss(tabId, css, persist) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    css,
  });

  let modId = null;
  // 默认 persist=true（默认让改动留下来；只有显式传 false 才一次性）
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
      type: "css",
      content: css,
      createdAt: Date.now(),
    });
  }

  return { ok: true, modId };
}
