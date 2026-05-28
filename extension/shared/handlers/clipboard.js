// Clipboard write — 对标 GM_setClipboard。
// SW 没 navigator.clipboard。走 offscreen document（DOM_PARSER reason）写。
// 这里走更轻的路径：让 MAIN world 用 navigator.clipboard.writeText 写。
// 需要的不是权限而是 user gesture——大多数 mod 跑在 user action 后，OK。
// 兜底：用 offscreen 的 execCommand("copy")。

async function writeViaTab(tabId, text) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (t) => {
      try {
        await navigator.clipboard.writeText(t);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
    args: [text],
  });
  return result;
}

let offscreenClipboardReady = null;
async function ensureOffscreenClipboard() {
  if (offscreenClipboardReady) return offscreenClipboardReady;
  offscreenClipboardReady = (async () => {
    try {
      const has = await chrome.offscreen.hasDocument?.();
      if (has) return;
    } catch {}
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["CLIPBOARD"],
        justification: "modcrew clipboard write fallback",
      });
    } catch (e) {
      if (!String(e).toLowerCase().includes("already")) throw e;
    }
  })();
  return offscreenClipboardReady;
}

export async function handleClipboardWrite(tabId, text) {
  if (typeof text !== "string") throw new Error("clipboard.write requires string");
  if (tabId) {
    const r = await writeViaTab(tabId, text);
    if (r?.ok) return { ok: true, via: "tab" };
  }
  // 兜底：offscreen execCommand. offscreen.js / offscreen.html 已存在。
  await ensureOffscreenClipboard();
  const resp = await chrome.runtime.sendMessage({
    type: "modcrew-clipboard-write",
    text,
  });
  if (resp?.ok) return { ok: true, via: "offscreen" };
  throw new Error(resp?.error || "clipboard write failed");
}
