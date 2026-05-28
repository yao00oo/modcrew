import { deleteMod, getModById } from "../storage.js";
import { unregisterModAsUserScript } from "./user-scripts.js";

export async function handleDeleteMod(id) {
  // 先看 mod 是否注册成 user script，是则清理
  try {
    const mod = await getModById(id);
    if (mod?.useUserScripts) {
      await unregisterModAsUserScript(id);
    }
  } catch {}
  await deleteMod(id);
  return { ok: true, id };
}
