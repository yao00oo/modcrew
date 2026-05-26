// IndexedDB：mod 库
// schema:
//   mods: { id, domain, urlPattern, intent, type ('css'|'js'), content, createdAt }

const DB_NAME = "modcrew";
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("mods")) {
        const store = db.createObjectStore("mods", { keyPath: "id" });
        store.createIndex("domain", "domain", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveMod(mod) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readwrite");
    tx.objectStore("mods").put(mod);
    tx.oncomplete = () => resolve(mod);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMods(domain) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readonly");
    const idx = tx.objectStore("mods").index("domain");
    const req = idx.getAll(domain);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMod(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mods", "readwrite");
    tx.objectStore("mods").delete(id);
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
