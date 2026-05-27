const statusEl = document.getElementById("status");
const cmdEl = document.getElementById("mcp-cmd");
const copyBtn = document.getElementById("copy-btn");
const setupHint = document.getElementById("setup-hint");
const modsListEl = document.getElementById("mods-list");
const updateBanner = document.getElementById("update-banner");
const regenBtn = document.getElementById("regen-btn");
const libTabs = document.querySelectorAll(".lib-tab");
const modal = document.getElementById("source-modal");
const modalTitle = document.getElementById("modal-title");
const modalContent = document.getElementById("modal-content");
const modalClose = document.getElementById("modal-close");

let currentCmd = "";
let currentDomain = null;
let allMods = [];
let filter = "current";

function buildCmd(mcpUrl) {
  return `claude mcp add modcrew --transport http ${mcpUrl}`;
}

async function refreshStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "get_status" });

  if (resp?.connected) {
    statusEl.textContent = "● Connected";
    statusEl.className = "status connected";
  } else if (resp?.token) {
    statusEl.textContent = "● Connecting…";
    statusEl.className = "status connecting";
  } else {
    statusEl.textContent = "● Starting…";
    statusEl.className = "status disconnected";
  }

  if (resp?.mcpUrl) {
    currentCmd = buildCmd(resp.mcpUrl);
    cmdEl.textContent = currentCmd;
  }

  if (resp?.update) {
    const u = resp.update;
    updateBanner.style.display = "block";
    updateBanner.innerHTML =
      `🎉 New version <b>v${u.latest}</b> available (you have v${resp.version}). ` +
      `<a href="${u.zipUrl || u.url}" target="_blank">Download</a> · ` +
      `<a href="${u.url}" target="_blank">What's new</a>`;
  } else {
    updateBanner.style.display = "none";
  }
}

async function loadMods() {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  try {
    currentDomain = tab?.url ? new URL(tab.url).hostname : null;
  } catch {
    currentDomain = null;
  }
  allMods = await chrome.runtime.sendMessage({ type: "get_all_mods" });
  if (!Array.isArray(allMods)) allMods = [];
  renderMods();
}

function renderMods() {
  const filtered =
    filter === "current" && currentDomain
      ? allMods.filter((m) => m.domain === currentDomain)
      : allMods;

  modsListEl.innerHTML = "";

  if (!filtered.length) {
    const msg =
      filter === "current"
        ? `No mods on <b>${currentDomain || "(this page)"}</b> yet. Ask Claude to make one.`
        : "No mods saved yet.";
    modsListEl.innerHTML = `<li class="empty">${msg}</li>`;
    return;
  }

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  for (const m of filtered) {
    const li = document.createElement("li");
    li.className = "mod-row" + (m.enabled === false ? " disabled" : "");
    li.innerHTML = `
      <label class="toggle">
        <input type="checkbox" data-id="${m.id}" ${m.enabled !== false ? "checked" : ""} />
      </label>
      <div class="mod-meta">
        <div class="mod-line">
          <span class="type-badge ${m.type}">${m.type}</span>
          <span class="intent">${escapeHtml(m.intent || "(inline)")}</span>
        </div>
        <div class="mod-sub">${escapeHtml(m.urlPattern || m.domain)}</div>
      </div>
      <div class="mod-actions">
        <button class="link-btn view" data-id="${m.id}">View</button>
        <button class="link-btn delete" data-id="${m.id}">×</button>
      </div>
    `;
    modsListEl.appendChild(li);
  }

  modsListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
    cb.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      await chrome.runtime.sendMessage({
        type: "toggle_mod",
        id,
        enabled: e.target.checked,
      });
      const mod = allMods.find((m) => m.id === id);
      if (mod) mod.enabled = e.target.checked;
      renderMods();
    })
  );

  modsListEl.querySelectorAll(".view").forEach((b) =>
    b.addEventListener("click", () => {
      const mod = allMods.find((m) => m.id === b.dataset.id);
      if (!mod) return;
      modalTitle.textContent = `${mod.type} · ${mod.intent || "(inline)"}`;
      modalContent.textContent = mod.content || "";
      modal.style.display = "flex";
    })
  );

  modsListEl.querySelectorAll(".delete").forEach((b) =>
    b.addEventListener("click", async () => {
      const mod = allMods.find((m) => m.id === b.dataset.id);
      if (!mod) return;
      if (!confirm(`Delete this ${mod.type} mod?\n\n${mod.intent || "(inline)"}`)) return;
      await chrome.runtime.sendMessage({ type: "delete_mod", id: mod.id });
      allMods = allMods.filter((m) => m.id !== mod.id);
      renderMods();
    })
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

libTabs.forEach((t) =>
  t.addEventListener("click", () => {
    libTabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    filter = t.dataset.filter;
    renderMods();
  })
);

copyBtn.onclick = async () => {
  if (!currentCmd) return;
  try {
    await navigator.clipboard.writeText(currentCmd);
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✓ Copied";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = orig;
      copyBtn.classList.remove("copied");
    }, 1500);
  } catch {
    alert("Copy failed. Select the command and copy manually.");
  }
};

regenBtn.onclick = async () => {
  if (
    !confirm(
      "Generate a new token? Your current Claude Code config will stop working until you re-run 'claude mcp add' with the new URL."
    )
  )
    return;
  const resp = await chrome.runtime.sendMessage({ type: "regenerate_token" });
  if (resp?.mcpUrl) {
    currentCmd = buildCmd(resp.mcpUrl);
    cmdEl.textContent = currentCmd;
    setupHint.textContent = "New token issued. Re-run the command above in Claude Code.";
  }
};

modalClose.onclick = () => (modal.style.display = "none");
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

refreshStatus();
loadMods();
setInterval(refreshStatus, 2000);
// 每次打开 popup 刷新一次 mods（不轮询，避免 spam）
