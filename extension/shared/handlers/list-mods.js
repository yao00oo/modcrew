import { getAllMods, getModsForDomain, listVersionsForMod } from "../storage.js";

// Session 开始的近似时间 —— SW 启动后第一次被加载时记下来。
// 用于 recencyHint 的 'last_session' 判定。
const sessionStart = Date.now();

function classifyRecency(updatedAt) {
  if (!updatedAt) return "older";
  const dt = Date.now() - updatedAt;
  if (updatedAt >= sessionStart) return "last_session";
  if (dt < 30 * 60_000) return "recent"; // 30 分钟
  if (dt < 24 * 3600_000) return "today";
  return "older";
}

export async function handleListMods(domain, opts) {
  const includeArchived = opts && opts.includeArchived === true;
  const raw = domain ? await getModsForDomain(domain) : await getAllMods();
  const mods = includeArchived ? raw : raw.filter((m) => !m.archivedAt);
  // 不查 versionCount 一个个会很慢; 仅查 currentVersion (已在 mod 上)
  return mods.map((m) => ({
    id: m.id,
    domain: m.domain,
    urlPattern: m.urlPattern,
    intent: m.intent,
    type: m.type,
    enabled: m.enabled !== false,
    archivedAt: m.archivedAt || null,
    versionCount: m.currentVersion || 1,
    lastModifiedAt: m.updatedAt || m.createdAt,
    recencyHint: classifyRecency(m.updatedAt || m.createdAt),
    contentPreview: (m.content || "").slice(0, 200),
    contentLength: (m.content || "").length,
    createdAt: m.createdAt,
  }));
}
