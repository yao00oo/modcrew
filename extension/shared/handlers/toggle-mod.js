import { toggleMod } from "../storage.js";

export async function handleToggleMod(id, enabled) {
  await toggleMod(id, enabled);
  return { ok: true, id, enabled };
}
