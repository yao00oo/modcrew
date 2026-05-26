// install page logic
//
// 1. 拉 token 从 /api/pair
// 2. 显示 claude mcp add 命令
// 3. 提供 Copy 按钮
// 4. 提供 Add to Chrome 按钮
// 5. 装好扩展后通过 chrome.runtime.sendMessage 发 token 过去配对
// 6. 轮询 /api/status/:token 检查 extensionConnected

const API_BASE = (window.location.hostname === "localhost"
  ? "http://localhost:8787"
  : "https://api.modcrew.dev");

// 稳定 ID（manifest "key" 字段确定）
// Chrome Store 发布后会用同一个 ID（因为 key 一致）
const EXT_ID = "bomfkpfghcngaankcnabchjhmgiopefa";

let token = null;

async function pair() {
  // 1. 拿 token
  try {
    const r = await fetch(`${API_BASE}/api/pair`, { method: "POST" });
    const data = await r.json();
    token = data.token;
  } catch (e) {
    document.getElementById("token-hint").textContent =
      "Failed to reach " + API_BASE + ". Try again.";
    return;
  }

  const cmd = `claude mcp add modcrew --transport http ${API_BASE}/mcp/${token}`;
  document.getElementById("mcp-cmd").textContent = cmd;
  document.getElementById("token-hint").innerHTML = `Token: <code>${token.slice(0, 8)}…</code>`;

  // 2. Copy 按钮
  document.getElementById("copy-btn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      const btn = document.getElementById("copy-btn");
      const orig = btn.textContent;
      btn.textContent = "✓ Copied";
      setTimeout(() => (btn.textContent = orig), 1500);
    } catch (e) {
      alert("Copy failed. Select and copy manually.");
    }
  };

  // 3. 尝试发 token 给扩展（如果已装）
  trySendToExtension();
  // 4. 同时轮询 worker 看 extension 是否连上
  pollStatus();
}

function trySendToExtension() {
  if (!chrome?.runtime?.sendMessage) {
    setPairMsg("Extension not detected. Install it first.", "pending");
    return;
  }
  try {
    chrome.runtime.sendMessage(EXT_ID, { type: "pair", token }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        // 扩展没装或拒绝，等用户装完后自然会触发
        setPairMsg("Waiting for extension…", "pending");
      } else {
        setPairMsg("Token sent to extension. Verifying…", "pending");
      }
    });
  } catch (e) {
    setPairMsg("Waiting for extension…", "pending");
  }
}

async function pollStatus() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const r = await fetch(`${API_BASE}/api/status/${token}`);
      const data = await r.json();
      if (data.extensionConnected) {
        setPairMsg("✅ Paired — you're ready!", "paired");
        return;
      }
      // 每 5 秒再 push 一次给扩展
      if (i % 3 === 0) trySendToExtension();
    } catch {}
  }
  setPairMsg("Timed out. Refresh to retry.", "pending");
}

function setPairMsg(msg, state) {
  const el = document.getElementById("pair-status");
  el.className = "pair-status " + state;
  document.getElementById("pair-msg").textContent = msg;
}

pair();
