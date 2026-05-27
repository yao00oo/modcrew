// 在目标 tab 上对 selector 触发 mouseover/mouseenter，让 hover-only UI（菜单展开等）显出来。

export async function handleHover(tabId, selector) {
  if (!selector || typeof selector !== "string") {
    throw new Error("modcrew.hover: selector is required");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [selector],
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `not found: ${sel}` };
      el.scrollIntoView?.({ block: "center", behavior: "instant" });
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mouseenter", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      return { ok: true, selector: sel };
    },
  });
  if (!result?.ok) throw new Error(result?.error || "hover failed");
  return result;
}
