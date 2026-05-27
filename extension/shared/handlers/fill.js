// 在目标 tab 上把 selector 指向的 input/textarea/contenteditable 填上 value。
// 同时 dispatch input/change 事件，让 React 等 controlled-input 框架接住。

export async function handleFill(tabId, selector, value) {
  if (!selector || typeof selector !== "string") {
    throw new Error("modcrew.fill: selector is required");
  }
  const text = value == null ? "" : String(value);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [selector, text],
    func: (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `not found: ${sel}` };
      el.scrollIntoView?.({ block: "center", behavior: "instant" });
      el.focus?.();

      // React 的 controlled inputs：直接改 .value 不会触发监听，要走 native setter
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");

      if (el.isContentEditable) {
        el.textContent = val;
      } else if (desc?.set) {
        desc.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, selector: sel, valueLength: val.length };
    },
  });
  if (!result?.ok) throw new Error(result?.error || "fill failed");
  return result;
}
