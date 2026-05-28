// Tab control — 对标 GM_openInTab / GM_closeTab / GM_getTab / GM_saveTab.

export async function handleOpenTab(url, opts = {}) {
  if (!url || typeof url !== "string") throw new Error("openTab: url required");
  const tab = await chrome.tabs.create({
    url,
    active: opts.active !== false, // 默认前台
    windowId: opts.windowId,
    index: opts.index,
    pinned: opts.pinned === true,
  });
  return {
    tabId: tab.id,
    url: tab.url || tab.pendingUrl || url,
    windowId: tab.windowId,
  };
}

export async function handleCloseTab(tabId) {
  if (typeof tabId !== "number") throw new Error("closeTab: tabId required");
  await chrome.tabs.remove(tabId);
  return { ok: true };
}

export async function handleGetTab(tabId) {
  if (typeof tabId !== "number") throw new Error("getTab: tabId required");
  const t = await chrome.tabs.get(tabId);
  return {
    tabId: t.id,
    url: t.url,
    title: t.title,
    active: t.active,
    windowId: t.windowId,
    status: t.status,
    pinned: t.pinned,
  };
}
