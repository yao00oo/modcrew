// chrome.userScripts 包装层（Tweeks 同款架构）
//
// 用 chrome.userScripts.register 代替 content/auto-apply.js 的 round-trip 路径：
//   - 注册 = 持久化（Chrome 自己管 reload 自动注入）
//   - runAt: document_start 保证早于页面自家 script
//   - world: MAIN（默认）保留 page window 访问
//
// 不可用时降级走旧 path（auto-apply.js + executeScript）。
//
// 可用性条件：
//   - Chrome 120+
//   - manifest 有 "userScripts" 权限
//   - 用户在 chrome://extensions 开启 "Allow User Scripts" 切换
//
// chrome.userScripts.register 持久化跨 SW 重启；不需要每次启动重注。

import { getAllMods } from "../storage.js";

let availabilityCache = null;

export function isUserScriptsAvailable() {
  if (availabilityCache !== null) return availabilityCache;
  try {
    if (!chrome?.userScripts) {
      availabilityCache = false;
      return false;
    }
    // 进一步探测：试调 getScripts，被拒会抛
    // 但这是异步的，第一次 sync 不做强校验，能 import 即认为 API 存在
    availabilityCache = typeof chrome.userScripts.register === "function";
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

// 真探测：能调 getScripts 才算 ready（用户开了开关）
export async function probeUserScriptsReady() {
  if (!isUserScriptsAvailable()) return false;
  try {
    await chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

function modToUserScript(mod) {
  return {
    id: `mod-${mod.id}`,
    matches: [mod.urlPattern || `https://${mod.domain}/*`],
    js: [{ code: mod.content }],
    runAt: "document_start",
    world: "MAIN",
  };
}

export async function registerModAsUserScript(mod) {
  if (mod.type !== "js") return false;
  if (!isUserScriptsAvailable()) return false;
  try {
    await chrome.userScripts.register([modToUserScript(mod)]);
    return true;
  } catch (e) {
    console.warn("[modcrew] userScripts.register failed:", mod.id, e?.message || e);
    return false;
  }
}

export async function unregisterModAsUserScript(modId) {
  if (!isUserScriptsAvailable()) return false;
  try {
    await chrome.userScripts.unregister({ ids: [`mod-${modId}`] });
    return true;
  } catch (e) {
    // 不存在 → 静默
    return false;
  }
}

export async function updateModAsUserScript(mod) {
  if (mod.type !== "js") return false;
  if (!isUserScriptsAvailable()) return false;
  try {
    await chrome.userScripts.update([modToUserScript(mod)]);
    return true;
  } catch {
    // update 不存在 → 尝试 register
    return registerModAsUserScript(mod);
  }
}

// 启动时一次性对账：IndexedDB 里 useUserScripts=true 的 mod 都该有对应注册项。
// 若用户刚开启 userScripts 切换或迁移老数据，这里补齐。
export async function reconcileUserScripts() {
  if (!isUserScriptsAvailable()) return;
  let registered;
  try {
    registered = await chrome.userScripts.getScripts();
  } catch {
    return;
  }
  const registeredIds = new Set(registered.map((s) => s.id));
  const allMods = await getAllMods();
  const desired = allMods.filter(
    (m) => m.type === "js" && m.enabled !== false && m.useUserScripts === true
  );
  // 补齐缺的
  const toAdd = desired
    .filter((m) => !registeredIds.has(`mod-${m.id}`))
    .map(modToUserScript);
  if (toAdd.length) {
    try {
      await chrome.userScripts.register(toAdd);
    } catch (e) {
      console.warn("[modcrew] reconcile register failed:", e?.message || e);
    }
  }
  // 删多余的（删除/禁用了但还有注册）
  const desiredIds = new Set(desired.map((m) => `mod-${m.id}`));
  const stale = [...registeredIds].filter(
    (id) => id.startsWith("mod-") && !desiredIds.has(id)
  );
  if (stale.length) {
    try {
      await chrome.userScripts.unregister({ ids: stale });
    } catch {}
  }
}

// 配置 USER_SCRIPT world 的 CSP（兜底，目前未启用 — MAIN world 不受影响）
export async function configureUserScriptWorld() {
  if (!isUserScriptsAvailable()) return;
  if (!chrome.userScripts.configureWorld) return;
  try {
    await chrome.userScripts.configureWorld({ messaging: true });
  } catch {}
}
