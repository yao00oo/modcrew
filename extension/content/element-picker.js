// 可视化元素选择器 content script。
// 通过 chrome.scripting.executeScript 在用户点 popup "Pick element" 时按需注入。
// 启动后接管页面：hover 高亮 → click 抓 selector → 写 chrome.storage 给 LLM/popup 读。
//
// selector 生成策略（参考 Tweeks element-selector.js）：
//   1) 有 id → #id
//   2) 否则祖先链上拼 tag.class:nth-child(N)，最多 3 层
// 既保证唯一性也避免长得离谱。

(() => {
  if (window.__modcrewPickerLoaded) {
    if (typeof window.__modcrewPickerStart === "function") window.__modcrewPickerStart();
    return;
  }
  window.__modcrewPickerLoaded = true;

  const OVERLAY_ID = "__modcrew_picker_overlay__";
  const TOOLTIP_ID = "__modcrew_picker_tooltip__";
  const STYLE_ID = "__modcrew_picker_style__";

  let active = false;
  let hovered = null;
  let tooltip = null;

  function buildSelector(el) {
    if (!el) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 3) {
      let part = cur.tagName.toLowerCase();
      if (typeof cur.className === "string" && cur.className.trim()) {
        const cls = cur.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.startsWith("__modcrew"))
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join("");
        if (cls) part += cls;
      }
      if (cur.parentElement) {
        const sib = [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName);
        if (sib.length > 1) {
          const idx = sib.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function buildInfo(el) {
    const rect = el.getBoundingClientRect();
    return {
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: typeof el.className === "string" ? el.className : null,
      text: (el.textContent || "").trim().slice(0, 120),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      url: location.href,
    };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .__modcrew_picker_outline__ {
        outline: 2px solid #7c3aed !important;
        outline-offset: 1px !important;
        background-color: rgba(124, 58, 237, 0.08) !important;
        cursor: crosshair !important;
      }
      body.__modcrew_picker_active__, body.__modcrew_picker_active__ * {
        cursor: crosshair !important;
      }
      #${TOOLTIP_ID} {
        position: fixed;
        z-index: 2147483647;
        background: #1a1a1a;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11px;
        pointer-events: none;
        max-width: 360px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      #${TOOLTIP_ID} .__modcrew_selector__ { color: #c4b5fd; }
      #${TOOLTIP_ID} .__modcrew_hint__ { color: #aaa; font-size: 10px; margin-top: 4px; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureTooltip() {
    if (tooltip && document.body.contains(tooltip)) return;
    tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    document.body.appendChild(tooltip);
  }

  function showTooltip(el, x, y) {
    ensureTooltip();
    const info = buildInfo(el);
    tooltip.innerHTML = `
      <div class="__modcrew_selector__">${info.selector || "(no selector)"}</div>
      ${info.text ? `<div>${escapeText(info.text)}</div>` : ""}
      <div class="__modcrew_hint__">Click to select · Esc to cancel</div>
    `;
    const tw = tooltip.offsetWidth || 200;
    const th = tooltip.offsetHeight || 40;
    let px = x + 12;
    let py = y + 12;
    if (px + tw > innerWidth) px = x - tw - 12;
    if (py + th > innerHeight) py = y - th - 12;
    tooltip.style.left = `${Math.max(8, px)}px`;
    tooltip.style.top = `${Math.max(8, py)}px`;
  }

  function escapeText(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function clearHover() {
    if (hovered) hovered.classList.remove("__modcrew_picker_outline__");
    hovered = null;
  }

  function onMove(e) {
    if (!active) return;
    const t = e.target;
    if (!t || t === document.documentElement || t === document.body) return;
    if (t.id === TOOLTIP_ID) return;
    if (t !== hovered) {
      clearHover();
      hovered = t;
      hovered.classList.add("__modcrew_picker_outline__");
    }
    showTooltip(t, e.clientX, e.clientY);
  }

  function onClick(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.target;
    if (!t) return;
    const info = buildInfo(t);
    stop();
    chrome.runtime.sendMessage({ type: "element_picked", info }).catch(() => {});
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      stop();
      chrome.runtime.sendMessage({ type: "element_pick_cancelled" }).catch(() => {});
    }
  }

  function start() {
    if (active) return;
    active = true;
    injectStyle();
    document.body.classList.add("__modcrew_picker_active__");
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function stop() {
    active = false;
    document.body.classList.remove("__modcrew_picker_active__");
    clearHover();
    if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    tooltip = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  }

  window.__modcrewPickerStart = start;
  window.__modcrewPickerStop = stop;
  start();
})();
