export async function handleScreenshot(tabId) {
  const tab = await chrome.tabs.get(tabId);
  // captureVisibleTab 是 windowId 维度
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  return { dataUrl };
}
