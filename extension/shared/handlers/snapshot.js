// 取当前 tab 的页面快照
// 通过 chrome.scripting.executeScript 在页面上下文跑

export async function handleSnapshot(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectSnapshot,
  });
  return result;
}

function collectSnapshot() {
  // 摘要式快照：避免把整个 DOM 全发回（vision 太贵）
  const ax = (el, depth = 0, maxDepth = 6) => {
    if (!el || depth > maxDepth) return null;
    const role = el.getAttribute?.("role") ||
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

  return {
    url: location.href,
    title: document.title,
    viewport: { w: innerWidth, h: innerHeight },
    accessibilityTree: ax(document.body),
  };
}
