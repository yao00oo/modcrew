// IndexedDB：mod 库
// schema:
//   mods: { id, domain, urlPattern, intent, type ('css'|'js'),
//           content, enabled, createdAt }

const DB_NAME = "modcrew";
const DB_VERSION = 2;
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
      // v1 → v2: backfill enabled=true for old rows
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

// Match by hostname index, then filter by urlPattern against full URL
export async function getModsMatching(url) {
  const u = new URL(url);
  const candidates = await getModsForDomain(u.hostname);
  return candidates.filter((m) => {
    if (m.enabled === false) return false;
    if (!m.urlPattern) return true; // legacy: hostname-only match
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

// Back-compat alias (some callers still use getMods)
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

export async function getAllMods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readonly");
    const req = tx.objectStore("mods").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Greasemonkey-style match: * = any char run, otherwise literal
export function matchesPattern(url, pattern) {
  // 把 * 转 .*, 其他特殊字符转义
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
