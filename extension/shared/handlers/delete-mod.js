import { deleteMod } from "../storage.js";

export async function handleDeleteMod(id) {
  await deleteMod(id);
  return { ok: true, id };
}
