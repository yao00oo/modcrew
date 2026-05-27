// Content script — modcrew.dev/* only
// 作用：把扩展生成的 token 镜像到 modcrew.dev 的 localStorage，并在扩展被 Remove + 重装后
//      用 localStorage 里的旧 token 恢复扩展 chrome.storage（这样 Claude Code 不用重配）
//
// localStorage 是 modcrew.dev 这个 origin 的，跨扩展生命周期持久化（Chrome 不会因为扩展被
// Remove 就清掉网站自己的 storage）。token 永远只待在用户浏览器里，modcrew.dev 服务器看不到。
//
// 决策表见 sw.js handleSyncTokenFromPage。

(async () => {
  const LS_KEY = "modcrew_token";
  let localToken = null;
  try {
    localToken = localStorage.getItem(LS_KEY);
  } catch (e) {
    // localStorage 偶尔被禁（隐私模式等）；不阻塞
    console.warn("[modcrew] localStorage read failed:", e);
  }

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "sync_token_from_page",
      localStorageToken: localToken,
    });
  } catch (e) {
    // SW 未启动 / 扩展被禁；无能为力
    console.warn("[modcrew] sync_token_from_page failed:", e);
    return;
  }
  if (!resp) return;

  try {
    if (resp.action === "update_local_storage" && resp.token) {
      localStorage.setItem(LS_KEY, resp.token);
    } else if (resp.action === "clear_local_storage") {
      localStorage.removeItem(LS_KEY);
    }
  } catch (e) {
    console.warn("[modcrew] localStorage write failed:", e);
  }
})();
