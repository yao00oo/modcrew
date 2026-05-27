// Code Mode 入口（v1.0.1）
//
// MV3 SW 的 CSP 禁 eval/Function 构造器，所以直接在 SW 里跑 LLM 代码会报 CSP。
// 改用 offscreen document + sandbox iframe 双层：
//   - sandbox 页面（manifest.sandbox.pages 声明）默认允许 eval，跑 LLM 代码
//   - sandbox 没有 chrome.* 权限，所有 modcrew.* 调用通过 postMessage 让 offscreen 代理
//   - offscreen 有 chrome.runtime，转发给 SW 这边的 handleModcrewApiCall 真正执行

let offscreenReady = null;

async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    // hasDocument 在新 Chrome 上存在；老版本走 catch
    try {
      const has = await chrome.offscreen.hasDocument?.();
      if (has) return;
    } catch {}
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["IFRAME_SCRIPTING"],
        justification:
          "Run user-supplied JavaScript for modcrew_execute in a sandboxed iframe (Code Mode).",
      });
    } catch (e) {
      // 已存在的话忽略
      if (!String(e).toLowerCase().includes("already")) throw e;
    }
  })();
  return offscreenReady;
}

export async function handleExecute(code) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("modcrew_execute requires a non-empty `code` string");
  }
  await ensureOffscreen();
  // 把代码转发给 offscreen → sandbox iframe
  const resp = await chrome.runtime.sendMessage({
    type: "modcrew-execute-in-sandbox",
    code,
  });
  if (!resp) {
    throw new Error("No response from offscreen sandbox");
  }
  if (!resp.ok) {
    const err = new Error(resp.error || "modcrew_execute failed");
    if (resp.stack) err.stack = resp.stack;
    throw err;
  }
  return resp.result;
}
