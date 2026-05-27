export async function handleListTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.url && !t.url.startsWith("chrome://"))
    .map((t) => ({
      tabId: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      windowId: t.windowId,
    }));
}
