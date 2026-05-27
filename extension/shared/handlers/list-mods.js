import { getAllMods, getModsForDomain } from "../storage.js";

export async function handleListMods(domain) {
  const mods = domain ? await getModsForDomain(domain) : await getAllMods();
  // 截断 content 避免回包过大；完整内容需要时再单独取
  return mods.map((m) => ({
    id: m.id,
    domain: m.domain,
    urlPattern: m.urlPattern,
    intent: m.intent,
    type: m.type,
    enabled: m.enabled !== false,
    contentPreview: (m.content || "").slice(0, 200),
    contentLength: (m.content || "").length,
    createdAt: m.createdAt,
  }));
}
