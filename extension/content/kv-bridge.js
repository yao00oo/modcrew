// KV 变化广播桥：sw 写 KV 后 sendMessage 给所有 tab，
// 这里把消息变成 window 上的 CustomEvent，让 MAIN world 的 mod 能 addEventListener。
// run_at: document_idle 即可（mod 是页面跑起来后才装 listener 的）

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "modcrew-kv-change") return;
  try {
    const ev = new CustomEvent("modcrew-kv-change", {
      detail: {
        key: msg.key,
        value: msg.value,
        oldValue: msg.oldValue ?? null,
        op: msg.op || "set",
      },
    });
    window.dispatchEvent(ev);
  } catch (e) {
    // 跑在严格 CSP 站时 CustomEvent 也可能受限 — 静默
  }
});
