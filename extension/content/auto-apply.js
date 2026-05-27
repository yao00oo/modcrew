// Content script: 页面加载时 auto-apply 已保存且 enabled 的 mod
// run_at: document_start
//
// 注入路径：content script (isolated world) 拿到 mod 列表后委托给 sw，
// 由 sw 调 chrome.scripting.insertCSS / executeScript({world:'MAIN'}) 注入。
// 走 sw 是为了绕开严格 CSP（'self' / nonce-only 站会拦 inline <script>/<style>）。

(async () => {
  // Host disable gate：先问 sw 当前 host 是不是关了，是就直接退出
  try {
    const gate = await chrome.runtime.sendMessage({
      type: "is_host_disabled",
      host: location.hostname,
    });
    if (gate?.disabled) return;
  } catch {}

  let mods = [];
  try {
    mods = await chrome.runtime.sendMessage({
      type: "get_mods_for_url",
      url: location.href,
    });
  } catch {
    return;
  }
  if (!Array.isArray(mods) || mods.length === 0) return;

  try {
    await chrome.runtime.sendMessage({
      type: "apply_persisted_mods",
      mods,
    });
  } catch (e) {
    console.warn("[modcrew] apply_persisted_mods failed:", e);
  }
})();
