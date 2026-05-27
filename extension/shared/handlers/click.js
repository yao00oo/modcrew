// 在目标 tab 上点一个 selector。
// 用 chrome.scripting.executeScript 跑 MAIN world，确保 click 事件能触发页面 framework
// (React/Vue/etc) 自己的 listener。

export async function handleClick(tabId, selector) {
  if (!selector || typeof selector !== "string") {
    throw new Error("modcrew.click: selector is required");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [selector],
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `not found: ${sel}` };
      el.scrollIntoView?.({ block: "center", behavior: "instant" });
      // 综合 mousedown + mouseup + click，覆盖大部分 framework
      const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      if (typeof el.click === "function") el.click();
      else el.dispatchEvent(new MouseEvent("click", opts));
      return { ok: true, selector: sel, tag: el.tagName.toLowerCase() };
    },
  });
  if (!result?.ok) throw new Error(result?.error || "click failed");
  return result;
}
