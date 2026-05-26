// V1 简单实现：返回可访问性树里 label 模糊匹配的节点
// 后续可以加视觉匹配（截图 + 模型）

export async function handleFindElement(tabId, intent) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: findByIntent,
    args: [intent],
  });
  return result;
}

function findByIntent(intent) {
  const lower = intent.toLowerCase();
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const haystack = [
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("alt"),
      node.getAttribute?.("placeholder"),
      node.getAttribute?.("title"),
      node.getAttribute?.("name"),
      node.id,
      node.className,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystack.includes(lower)) {
      // 生成稳定 selector
      let selector = "";
      if (node.id) selector = `#${node.id}`;
      else if (node.getAttribute?.("aria-label"))
        selector = `${node.tagName.toLowerCase()}[aria-label="${node.getAttribute(
          "aria-label"
        )}"]`;
      else if (node.getAttribute?.("data-testid"))
        selector = `[data-testid="${node.getAttribute("data-testid")}"]`;
      else selector = generatePath(node);

      const r = node.getBoundingClientRect();
      out.push({
        selector,
        tag: node.tagName.toLowerCase(),
        label:
          node.getAttribute?.("aria-label") ||
          (node.textContent || "").trim().slice(0, 80),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        confidence: 0.7,
      });
      if (out.length >= 5) break;
    }
    node = walker.nextNode();
  }
  return { candidates: out };

  function generatePath(el) {
    const parts = [];
    while (el && el !== document.body) {
      let part = el.tagName.toLowerCase();
      if (el.parentElement) {
        const sibs = [...el.parentElement.children].filter(
          (s) => s.tagName === el.tagName
        );
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(" > ");
  }
}
