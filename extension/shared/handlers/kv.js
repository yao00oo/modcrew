// LLM 跨 session 的 key-value 存储。
// 用法场景：AI 记"我之前在这个网站给用户做过什么 mod、用户偏好、上次的 snapshot 结论"等。
//
// 实现：IndexedDB store "kv" with keyPath: "key"。值是 JSON。

import { openDB } from "../storage.js";

// 广播给所有 tab 的 content/kv-bridge.js，让 MAIN world 监听器收到 CustomEvent。
async function broadcastKvChange(payload) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.id) continue;
      // 静默失败 — tab 没装 content script / 已关闭都正常
      chrome.tabs.sendMessage(t.id, { type: "modcrew-kv-change", ...payload }).catch(() => {});
    }
  } catch {}
}

export async function handleGetValue(key, defaultValue) {
  if (!key || typeof key !== "string") throw new Error("getValue: key required");
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result?.value ?? defaultValue ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function handleSetValue(key, value) {
  if (!key || typeof key !== "string") throw new Error("setValue: key required");
  const db = await openDB();
  // 读旧值供 listener 用
  const oldValue = await new Promise((resolve) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  broadcastKvChange({ key, value, oldValue, op: "set" });
  return { ok: true, key };
}

export async function handleDeleteValue(key) {
  if (!key || typeof key !== "string") throw new Error("deleteValue: key required");
  const db = await openDB();
  const oldValue = await new Promise((resolve) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  broadcastKvChange({ key, value: null, oldValue, op: "delete" });
  return { ok: true, key };
}

export async function handleListValues(prefix) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").getAll();
    req.onsuccess = () => {
      let rows = req.result || [];
      if (prefix && typeof prefix === "string") {
        rows = rows.filter((r) => r.key.startsWith(prefix));
      }
      resolve(rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
    };
    req.onerror = () => reject(req.error);
  });
}

// 批量操作 — 对标 Tweeks/TM v5.3+ GM_getValues/GM_setValues
export async function handleGetValues(keys) {
  if (!Array.isArray(keys)) throw new Error("getValues: array of keys required");
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const store = tx.objectStore("kv");
    const out = {};
    let remaining = keys.length;
    if (remaining === 0) return resolve(out);
    for (const k of keys) {
      if (typeof k !== "string") {
        return reject(new Error("getValues: each key must be a string"));
      }
      const req = store.get(k);
      req.onsuccess = () => {
        out[k] = req.result?.value ?? null;
        if (--remaining === 0) resolve(out);
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function handleSetValues(map) {
  if (!map || typeof map !== "object") throw new Error("setValues: { key: value } object required");
  const db = await openDB();
  const now = Date.now();
  const keys = Object.keys(map);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    for (const key of keys) {
      store.put({ key, value: map[key], updatedAt: now });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // 批量也广播（per-key），避免 listener 漏触发
  for (const key of keys) {
    broadcastKvChange({ key, value: map[key], oldValue: null, op: "set" });
  }
  return { ok: true, count: keys.length };
}

export async function handleDeleteValues(keys) {
  if (!Array.isArray(keys)) throw new Error("deleteValues: array of keys required");
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    for (const k of keys) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  for (const key of keys) {
    broadcastKvChange({ key, value: null, oldValue: null, op: "delete" });
  }
  return { ok: true, count: keys.length };
}

// 注册一个 MAIN-world 监听器 — 包成 mod 持久化注入。
// 等价 GM_addValueChangeListener，但回调是 JS 字符串（Code Mode 一致）。
// 拿到 e.detail = { key, value, oldValue, op } 在 mod 代码里能用。
export async function handleAddValueChangeListener(opts = {}) {
  const { key, code, urlPattern } = opts;
  if (!key || typeof key !== "string") throw new Error("addValueChangeListener: key required");
  if (!code || typeof code !== "string") throw new Error("addValueChangeListener: code required");
  const target = urlPattern || "https://*/*";
  const wrapped = `
    (function(){
      const KEY = ${JSON.stringify(key)};
      window.addEventListener("modcrew-kv-change", function(e){
        if (!e?.detail || e.detail.key !== KEY) return;
        try {
          const detail = e.detail;
          (function(){ ${code} }).call({ key: detail.key, value: detail.value, oldValue: detail.oldValue, op: detail.op });
        } catch (err) { console.error("[modcrew] kv listener err:", err); }
      });
    })();
  `;
  // 直接复用 inject-js 路径 — 把当前 active tab 拿来注入并持久化
  const { handleInjectJs } = await import("./inject-js.js");
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) throw new Error("addValueChangeListener: no active tab");
  return handleInjectJs(tabId, wrapped, target, `kv-listener:${key}`);
}
