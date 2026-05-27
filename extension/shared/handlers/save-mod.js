import { saveMod } from "../storage.js";

export async function handleSaveMod(tabId, intent, content, contentType, urlPattern) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  const pattern = urlPattern || `https://${url.hostname}/*`;
  const modId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mod = {
    id: modId,
    domain: url.hostname,
    urlPattern: pattern,
    intent,
    type: contentType,
    content,
    enabled: true,
    createdAt: Date.now(),
  };
  await saveMod(mod);
  return { modId, domain: mod.domain, urlPattern: mod.urlPattern };
}
