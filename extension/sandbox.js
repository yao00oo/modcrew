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

// 构造 modcrew Proxy — 任何 modcrew.X(...) 走 postMessage。
// 支持二级命名空间: modcrew.cookie.get(...) → method = "cookie.get"
function callMethod(method, args) {
  const callId = ++callSeq;
  return new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    parent.postMessage(
      { type: "modcrew-api-call", callId, method, args },
      "*"
    );
  });
}

function buildModcrewProxy() {
  return new Proxy(
    {},
    {
      get(_target, top) {
        const topName = String(top);
        // 顶层既可能是函数 (modcrew.snapshot()) 也可能是命名空间 (modcrew.cookie.get())
        // 返回 callable proxy：可调用 + 可继续 .x
        const callable = (...args) => callMethod(topName, args);
        return new Proxy(callable, {
          get(_t, sub) {
            // 跳过 Promise / Function 内部 symbol
            if (typeof sub === "symbol") return undefined;
            const subName = String(sub);
            if (subName === "then" || subName === "catch" || subName === "finally") return undefined;
            return (...args) => callMethod(`${topName}.${subName}`, args);
          },
        });
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
