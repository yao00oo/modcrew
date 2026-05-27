import { API_DOCS } from "../api-docs.js";

export async function handleSearch(query) {
  if (!query) return { docs: API_DOCS };

  const q = query.toLowerCase();
  const lines = API_DOCS.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(q)) hits.push(i);
  }
  if (!hits.length) {
    return {
      docs: API_DOCS,
      note: `No exact match for "${query}". Returning full API docs.`,
    };
  }
  // 围绕每个 hit 抠 ±10 行上下文，合并重叠区间
  const ranges = hits.map((h) => [Math.max(0, h - 10), Math.min(lines.length, h + 25)]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const r of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  const chunks = merged.map(([s, e]) => lines.slice(s, e).join("\n"));
  return { matches: chunks.length, docs: chunks.join("\n\n---\n\n") };
}
