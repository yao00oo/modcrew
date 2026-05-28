// 取当前 tab 的页面快照 + 元素清单（inventory）
//
// inventory 是给 LLM 的"页面构成 X 光"：哪些 class 出现得最多 / 占多少面积 /
// 有几个 iframe / 几个 shadow root。让 Claude 写 CSS 前就知道改 .bg-white(占 38%) 比
// 改 .imperial-plan(占 0.2%) 收益高 47 倍。

export async function handleSnapshot(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectSnapshot,
  });
  return result;
}

function collectSnapshot() {
  // === 摘要式 accessibility tree（保留原逻辑）===
  const ax = (el, depth = 0, maxDepth = 6) => {
    if (!el || depth > maxDepth) return null;
    const role =
      el.getAttribute?.("role") ||
      ({ BUTTON: "button", A: "link", INPUT: "input", IMG: "img" })[el.tagName] ||
      el.tagName?.toLowerCase();
    const label =
      el.getAttribute?.("aria-label") ||
      el.getAttribute?.("alt") ||
      el.getAttribute?.("placeholder") ||
      (el.textContent || "").trim().slice(0, 60);
    const children = [];
    for (const c of el.children || []) {
      const sub = ax(c, depth + 1, maxDepth);
      if (sub) children.push(sub);
      if (children.length > 30) break;
    }
    const out = {};
    if (role) out.role = role;
    if (label) out.label = label;
    if (el.id) out.id = el.id;
    if (el.className && typeof el.className === "string") {
      out.cls = el.className.split(/\s+/).slice(0, 3).join(" ");
    }
    if (children.length) out.children = children;
    return out;
  };

  // === Inventory: 统计 dominant classes ===
  const viewportArea = innerWidth * innerHeight;
  const classStats = new Map(); // class → { count, area }
  let visibleCount = 0;
  let iframeCount = 0;
  let shadowRootCount = 0;

  // 在视口内才算"可见"，省得统计屏幕外几千 row 把数据稀释了
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom < -50 || r.top > innerHeight + 50) return false;
    if (r.right < -50 || r.left > innerWidth + 50) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) < 0.05) return false;
    return true;
  };

  const all = document.querySelectorAll("*");
  for (const el of all) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "META" || el.tagName === "LINK") continue;
    if (el.tagName === "IFRAME") iframeCount++;
    if (el.shadowRoot) shadowRootCount++;

    if (!isVisible(el)) continue;
    visibleCount++;
    const r = el.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));

    if (typeof el.className === "string" && el.className.trim()) {
      const classes = el.className.trim().split(/\s+/);
      // 每个 class 单独计 count；面积按整 element 算（一个 element 算多次没问题，反映该 class 的视觉权重）
      for (const c of classes) {
        if (!c || c.startsWith("__modcrew")) continue;
        let stat = classStats.get(c);
        if (!stat) {
          stat = { count: 0, area: 0 };
          classStats.set(c, stat);
        }
        stat.count++;
        stat.area += area;
      }
    }
  }

  // 取 top 12 by area
  const dominantClasses = [...classStats.entries()]
    .map(([cls, s]) => ({
      class: "." + cls,
      count: s.count,
      areaPercent: Math.round((s.area / viewportArea) * 100),
    }))
    .filter((c) => c.count >= 2 && c.areaPercent >= 1)
    .sort((a, b) => b.areaPercent - a.areaPercent)
    .slice(0, 12);

  return {
    url: location.href,
    title: document.title,
    viewport: { w: innerWidth, h: innerHeight },
    accessibilityTree: ax(document.body),
    inventory: {
      visibleElements: visibleCount,
      dominantClasses,
      iframes: iframeCount,
      shadowRoots: shadowRootCount,
      hint:
        dominantClasses.length > 0
          ? `Target ${dominantClasses[0].class} (count=${dominantClasses[0].count}, ~${dominantClasses[0].areaPercent}% of viewport) for biggest visual impact.`
          : "No repeating dominant classes detected. Page may be using inline styles or shadow DOM.",
    },
  };
}
