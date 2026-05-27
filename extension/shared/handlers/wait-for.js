// 在目标 tab 上 poll 直到 selector 存在（或可见，可选）。
// 默认 5s timeout。给 LLM 一个"等动态加载完成"的能力。

export async function handleWaitFor(tabId, selector, opts = {}) {
  if (!selector || typeof selector !== "string") {
    throw new Error("modcrew.waitFor: selector is required");
  }
  const timeoutMs = Math.max(100, Math.min(opts.timeoutMs || 5000, 30000));
  const visible = opts.visible === true; // 默认只看存在，不看可见
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [selector, timeoutMs, visible],
    func: (sel, deadlineMs, mustBeVisible) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const el = document.querySelector(sel);
          if (el) {
            if (!mustBeVisible) return resolve({ ok: true, foundAt: Date.now() - start, selector: sel });
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden") {
              return resolve({ ok: true, foundAt: Date.now() - start, selector: sel });
            }
          }
          if (Date.now() - start >= deadlineMs) {
            return resolve({ ok: false, error: `timed out after ${deadlineMs}ms waiting for ${sel}` });
          }
          setTimeout(check, 80);
        };
        check();
      });
    },
  });
  if (!result?.ok) throw new Error(result?.error || "waitFor failed");
  return result;
}
