// Offscreen bridge — SW ↔ sandbox iframe
//
// 协议：
//   SW → offscreen (chrome.runtime.sendMessage):
//     {type:"modcrew-execute-in-sandbox", code}
//   offscreen → SW (sendResponse):
//     {ok, result | error}
//
//   sandbox → offscreen (postMessage):
//     {type:"modcrew-api-call", callId, method, args}
//   offscreen → sandbox (postMessage):
//     {type:"modcrew-api-result", callId, ok, result | error}

const sandboxFrame = document.getElementById("sandbox");
let sandboxReady = false;
const sandboxReadyWaiters = [];

function whenSandboxReady() {
  if (sandboxReady) return Promise.resolve();
  return new Promise((resolve) => sandboxReadyWaiters.push(resolve));
}

let execSeq = 0;
const pendingExec = new Map();

window.addEventListener("message", async (e) => {
  if (e.source !== sandboxFrame.contentWindow) return;
  const msg = e.data;
  if (!msg) return;

  if (msg.type === "modcrew-sandbox-ready") {
    sandboxReady = true;
    sandboxReadyWaiters.splice(0).forEach((r) => r());
    return;
  }

  // sandbox 跑完 code，回结果
  if (msg.type === "modcrew-execute-result" && typeof msg.id === "number") {
    const p = pendingExec.get(msg.id);
    if (!p) return;
    pendingExec.delete(msg.id);
    p.resolve(msg);
    return;
  }

  // sandbox 调 modcrew.X(args) — 转发给 SW
  if (msg.type === "modcrew-api-call") {
    const { callId, method, args } = msg;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "modcrew-api-call",
        method,
        args,
      });
      if (resp?.ok) {
        sandboxFrame.contentWindow.postMessage(
          { type: "modcrew-api-result", callId, ok: true, result: resp.result },
          "*"
        );
      } else {
        sandboxFrame.contentWindow.postMessage(
          {
            type: "modcrew-api-result",
            callId,
            ok: false,
            error: resp?.error || "SW api call failed",
          },
          "*"
        );
      }
    } catch (err) {
      sandboxFrame.contentWindow.postMessage(
        {
          type: "modcrew-api-result",
          callId,
          ok: false,
          error: err?.message ?? String(err),
        },
        "*"
      );
    }
  }
});

// SW → offscreen: 跑一段 code
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Clipboard write 兜底（SW 没 navigator.clipboard，offscreen 也没；走 execCommand）
  if (msg?.type === "modcrew-clipboard-write") {
    try {
      const ta = document.createElement("textarea");
      ta.value = String(msg.text ?? "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      sendResponse({ ok });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message ?? String(e) });
    }
    return; // sync sendResponse
  }
  if (msg?.type !== "modcrew-execute-in-sandbox") return; // 不是我的消息
  (async () => {
    await whenSandboxReady();
    const id = ++execSeq;
    pendingExec.set(id, { resolve: (r) => sendResponse(r) });
    sandboxFrame.contentWindow.postMessage(
      { type: "modcrew-execute", id, code: msg.code },
      "*"
    );
  })();
  return true; // async sendResponse
});
