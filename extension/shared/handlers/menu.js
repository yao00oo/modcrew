// Context-menu API — 等价 GM_registerMenuCommand。
// 模型差异：
//   GM_registerMenuCommand 是 userscript 自己在 page 跑时活注册 + 死注销；
//   modcrew 的 mod 是短命的（每次 modcrew_execute 一次），不能持有回调。
//   因此 modcrew.menu(...) 是「持久 menu 项」：注册后写 IndexedDB，
//   点击时 SW 用 chrome.scripting.executeScript 把保存的 code 跑一遍。
//
// 这条路顺带帮你做：右键 → 跑一段 AI mod（不依赖弹窗）。

import { openDB } from "../storage.js";

const PARENT_ID = "modcrew-root";
let parentReady = false;

async function listMenus() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("menus", "readonly");
    const req = tx.objectStore("menus").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveMenu(menu) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("menus", "readwrite");
    tx.objectStore("menus").put(menu);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteMenu(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("menus", "readwrite");
    tx.objectStore("menus").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function ensureParentMenu() {
  if (parentReady) return;
  try {
    chrome.contextMenus.create(
      {
        id: PARENT_ID,
        title: "ModCrew",
        contexts: ["all"],
      },
      () => {
        // 已存在时 lastError，忽略
        void chrome.runtime.lastError;
      }
    );
  } catch {}
  parentReady = true;
}

function createMenuItem(menu) {
  ensureParentMenu();
  const opts = {
    id: menu.id,
    parentId: PARENT_ID,
    title: menu.label,
    contexts: ["all"],
  };
  if (menu.urlPattern && typeof menu.urlPattern === "string") {
    opts.documentUrlPatterns = [menu.urlPattern];
  }
  try {
    chrome.contextMenus.create(opts, () => {
      // 已存在则 update
      if (chrome.runtime.lastError) {
        try {
          chrome.contextMenus.update(menu.id, {
            title: menu.label,
            documentUrlPatterns: opts.documentUrlPatterns,
          });
        } catch {}
      }
    });
  } catch {}
}

export async function rebuildContextMenus() {
  ensureParentMenu();
  const menus = await listMenus();
  for (const m of menus) createMenuItem(m);
}

export async function handleRegisterMenu(opts = {}) {
  const { label, code, urlPattern, world = "MAIN" } = opts;
  if (!label || typeof label !== "string") throw new Error("menu: label required");
  if (!code || typeof code !== "string") throw new Error("menu: code required");
  const id = `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const menu = {
    id,
    label,
    code,
    urlPattern: urlPattern || null,
    world: world === "ISOLATED" ? "ISOLATED" : "MAIN",
    createdAt: Date.now(),
  };
  await saveMenu(menu);
  createMenuItem(menu);
  return { ok: true, id, label };
}

export async function handleUnregisterMenu(id) {
  if (!id || typeof id !== "string") throw new Error("unregisterMenu: id required");
  await deleteMenu(id);
  try {
    chrome.contextMenus.remove(id);
  } catch {}
  return { ok: true, id };
}

export async function handleListMenus() {
  const menus = await listMenus();
  return menus.map((m) => ({
    id: m.id,
    label: m.label,
    urlPattern: m.urlPattern,
    world: m.world,
    createdAt: m.createdAt,
  }));
}

// SW 收到 chrome.contextMenus.onClicked 后调这个跑 code
export async function runMenuByClick(info, tab) {
  if (!info?.menuItemId || !tab?.id) return;
  const db = await openDB();
  const menu = await new Promise((resolve, reject) => {
    const tx = db.transaction("menus", "readonly");
    const req = tx.objectStore("menus").get(info.menuItemId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!menu) return;

  const wrapped = `(async()=>{try{${menu.code}}catch(e){console.error('[modcrew] menu ${menu.id} error:',e)}})()`;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: menu.world || "MAIN",
      func: new Function(wrapped),
    });
  } catch (e) {
    console.warn("[modcrew] runMenuByClick failed:", e);
  }
}
