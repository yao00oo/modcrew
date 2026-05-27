// Sandboxed runner — 跑 LLM 写的 modcrew_execute 代码
// 没有 chrome.* 权限；所有 modcrew.* 调用通过 postMessage 让 parent (offscreen) 代理

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let callSeq = 0;
const pending = new Map();

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg) return;

  // parent 返回的 modcrew API 调用结果
  if (msg.type === "modcrew-api-result") {
    const p = pending.get(msg.callId);
    if (!p) return;
    pending.delete(msg.callId);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || "Unknown API error"));
    return;
  }

  // parent 派活：跑这段 code
  if (msg.type === "modcrew-execute" && typeof msg.id === "number") {
    runExecute(msg.id, msg.code);
  }
});

// 构造 modcrew Proxy — 任何 modcrew.X(...) 都走 postMessage
function buildModcrewProxy() {
  return new Proxy(
    {},
    {
      get(_target, method) {
        return (...args) => {
          const callId = ++callSeq;
          return new Promise((resolve, reject) => {
            pending.set(callId, { resolve, reject });
            parent.postMessage(
              { type: "modcrew-api-call", callId, method: String(method), args },
              "*"
            );
          });
        };
      },
    }
  );
}

async function runExecute(id, code) {
  const modcrew = buildModcrewProxy();
  try {
    const fn = new AsyncFunction("modcrew", code);
    const result = await fn(modcrew);
    parent.postMessage({ type: "modcrew-execute-result", id, ok: true, result }, "*");
  } catch (e) {
    parent.postMessage(
      {
        type: "modcrew-execute-result",
        id,
        ok: false,
        error: e?.message ?? String(e),
        stack: e?.stack,
      },
      "*"
    );
  }
}

// 告诉 parent: sandbox 就绪
parent.postMessage({ type: "modcrew-sandbox-ready" }, "*");
