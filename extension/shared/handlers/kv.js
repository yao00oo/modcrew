// LLM 跨 session 的 key-value 存储。
// 用法场景：AI 记"我之前在这个网站给用户做过什么 mod、用户偏好、上次的 snapshot 结论"等。
//
// 实现：IndexedDB store "kv" with keyPath: "key"。值是 JSON。

import { openDB } from "../storage.js";

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
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve({ ok: true, key });
    tx.onerror = () => reject(tx.error);
  });
}

export async function handleDeleteValue(key) {
  if (!key || typeof key !== "string") throw new Error("deleteValue: key required");
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve({ ok: true, key });
    tx.onerror = () => reject(tx.error);
  });
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
