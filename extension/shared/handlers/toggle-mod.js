import { toggleMod, getModById } from "../storage.js";
import {
  isUserScriptsAvailable,
  registerModAsUserScript,
  unregisterModAsUserScript,
} from "./user-scripts.js";

export async function handleToggleMod(id, enabled) {
  await toggleMod(id, enabled);
  // 同步 chrome.userScripts 状态：禁用时取消注册，启用时重新注册
  try {
    const mod = await getModById(id);
    if (mod?.type === "js" && isUserScriptsAvailable()) {
      if (enabled === false) {
        await unregisterModAsUserScript(id);
      } else if (mod.useUserScripts) {
        await registerModAsUserScript(mod);
      }
    }
  } catch {}
  return { ok: true, id, enabled };
}
