// 配置：dev / prod 切换
// dev:  http://localhost:8787  → wss://localhost:8787/ws/:token
// prod: https://api.modcrew.dev → wss://api.modcrew.dev/ws/:token

// 简单做法：localhost 是 dev，其他是 prod
// 后期可以做 UI 切换

export function getApiBase() {
  // 默认 prod。dev 模式从 storage 读
  // 你跑 wrangler dev 时手动在 service worker console 设置：
  //   chrome.storage.local.set({ apiBase: "http://localhost:8787" })
  return new Promise((resolve) => {
    chrome.storage.local.get("apiBase", (data) => {
      resolve(data.apiBase || "https://api.modcrew.dev");
    });
  });
}

export function wsUrl(base, token) {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = `/ws/${token}`;
  return u.toString();
}
