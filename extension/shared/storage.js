// IndexedDB schema (v5):
//   mods:  { id, domain, urlPattern, intent, type ('css'|'js'),
//            content, enabled, createdAt }
//   audit: { id (auto), timestamp, tool, method, args (short summary),
//            ok, error, durationMs }
//   kv:    { key, value, updatedAt }
//   menus: { id, label, code, urlPattern?, world?, createdAt }

const DB_NAME = "modcrew";
const DB_VERSION = 5;
const AUDIT_KEEP = 200;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const oldV = ev.oldVersion || 0;
      if (!db.objectStoreNames.contains("mods")) {
        const store = db.createObjectStore("mods", { keyPath: "id" });
        store.createIndex("domain", "domain", { unique: false });
      }
      if (oldV < 2) {
        const tx = ev.target.transaction;
        const store = tx.objectStore("mods");
        store.openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (!cur) return;
          if (cur.value.enabled === undefined) {
            cur.value.enabled = true;
            cur.update(cur.value);
          }
          cur.continue();
        };
      }
      if (oldV < 3 && !db.objectStoreNames.contains("audit")) {
        const audit = db.createObjectStore("audit", {
          keyPath: "id",
          autoIncrement: true,
        });
        audit.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (oldV < 4 && !db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "key" });
      }
      if (oldV < 5 && !db.objectStoreNames.contains("menus")) {
        db.createObjectStore("menus", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveMod(mod) {
  const db = await openDB();
  const withDefaults = { enabled: true, ...mod };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readwrite");
    tx.objectStore("mods").put(withDefaults);
    tx.oncomplete = () => resolve(withDefaults);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getModsMatching(url) {
  const u = new URL(url);
  const candidates = await getModsForDomain(u.hostname);
  return candidates.filter((m) => {
    if (m.enabled === false) return false;
    if (!m.urlPattern) return true;
    return matchesPattern(url, m.urlPattern);
  });
}

export async function getModsForDomain(domain) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readonly");
    const idx = tx.objectStore("mods").index("domain");
    const req = idx.getAll(domain);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export const getMods = getModsForDomain;

export async function deleteMod(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readwrite");
    tx.objectStore("mods").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function toggleMod(id, enabled) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readwrite");
    const store = tx.objectStore("mods");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const mod = getReq.result;
      if (!mod) {
        reject(new Error(`Mod ${id} not found`));
        return;
      }
      mod.enabled = enabled;
      store.put(mod);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getModById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readonly");
    const req = tx.objectStore("mods").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readonly");
    const req = tx.objectStore("mods").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function matchesPattern(url, pattern) {
  const re = new RegExp(
    "^" +
      pattern
        .split(/(\*)/)
        .map((p) => (p === "*" ? ".*" : p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
        .join("") +
      "$"
  );
  return re.test(url);
}

// === Audit log ===

export async function appendAudit(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audit", "readwrite");
    tx.objectStore("audit").add({ timestamp: Date.now(), ...entry });
    tx.oncomplete = () => {
      resolve();
      // 异步裁剪：超过 AUDIT_KEEP 删旧的
      pruneAudit().catch(() => {});
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function pruneAudit() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audit", "readwrite");
    const store = tx.objectStore("audit");
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total <= AUDIT_KEEP) {
        resolve();
        return;
      }
      let toDelete = total - AUDIT_KEEP;
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cur = e.target.result;
        if (!cur || toDelete <= 0) return;
        cur.delete();
        toDelete--;
        cur.continue();
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getRecentAudit(limit = 50) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audit", "readonly");
    const idx = tx.objectStore("audit").index("timestamp");
    const out = [];
    const req = idx.openCursor(null, "prev"); // 最新在前
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur || out.length >= limit) {
        resolve(out);
        return;
      }
      out.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAudit() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audit", "readwrite");
    tx.objectStore("audit").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// === Host disable / write permission (chrome.storage.local) ===

const DISABLED_HOSTS_KEY = "modcrew_disabled_hosts";
const WRITES_KEY = "modcrew_writes_enabled";

export async function isHostDisabled(host) {
  if (!host) return false;
  const data = await chrome.storage.local.get(DISABLED_HOSTS_KEY);
  const list = data[DISABLED_HOSTS_KEY] || [];
  return list.includes(host);
}

export async function setHostDisabled(host, disabled) {
  if (!host) return;
  const data = await chrome.storage.local.get(DISABLED_HOSTS_KEY);
  const list = new Set(data[DISABLED_HOSTS_KEY] || []);
  if (disabled) list.add(host);
  else list.delete(host);
  await chrome.storage.local.set({ [DISABLED_HOSTS_KEY]: [...list] });
}

export async function getDisabledHosts() {
  const data = await chrome.storage.local.get(DISABLED_HOSTS_KEY);
  return data[DISABLED_HOSTS_KEY] || [];
}

export async function getWritesEnabled() {
  const data = await chrome.storage.local.get(WRITES_KEY);
  // 默认 true（v1.2 之前都是隐式 true，不让升级用户体验断）
  return data[WRITES_KEY] !== false;
}

export async function setWritesEnabled(enabled) {
  await chrome.storage.local.set({ [WRITES_KEY]: !!enabled });
}

// === Last picked element (from visual picker → popup display + LLM read) ===

const PICKED_KEY = "modcrew_last_picked";

export async function setLastPicked(info) {
  await chrome.storage.local.set({ [PICKED_KEY]: { ...info, pickedAt: Date.now() } });
}

export async function getLastPicked() {
  const data = await chrome.storage.local.get(PICKED_KEY);
  return data[PICKED_KEY] || null;
}

export async function clearLastPicked() {
  await chrome.storage.local.remove(PICKED_KEY);
}
