// Content script: 页面加载时 auto-apply 已保存且 enabled 的 mod
// run_at: document_start
// 通过 sw 获取（pattern + enabled 在 sw 那边过滤好）

(async () => {
  let mods = [];
  try {
    mods = await chrome.runtime.sendMessage({
      type: "get_mods_for_url",
      url: location.href,
    });
  } catch {
    return;
  }
  if (!Array.isArray(mods)) return;

  for (const mod of mods) {
    try {
      if (mod.type === "css") {
        const style = document.createElement("style");
        style.dataset.modcrewId = mod.id;
        style.textContent = mod.content;
        (document.head || document.documentElement).appendChild(style);
      } else if (mod.type === "js") {
        const script = document.createElement("script");
        script.dataset.modcrewId = mod.id;
        script.textContent = mod.content;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      }
    } catch (e) {
      console.warn("[modcrew] apply mod failed:", mod.id, e);
    }
  }
})();
