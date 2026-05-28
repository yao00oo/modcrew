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

const siteToggle = document.getElementById("siteToggle");
const siteToggleHost = document.getElementById("siteToggleHost");
const writesToggle = document.getElementById("writesToggle");
const openActivityBtn = document.getElementById("openActivityBtn");
const pickElementBtn = document.getElementById("pickElementBtn");
const pickedCard = document.getElementById("picked-card");
const pickedSelector = document.getElementById("picked-selector");
const pickedTag = document.getElementById("picked-tag");
const pickedWhen = document.getElementById("picked-when");
const pickedCopy = document.getElementById("picked-copy");
const pickedClear = document.getElementById("picked-clear");
const activityModal = document.getElementById("activity-modal");
const activityList = document.getElementById("activity-list");
const activityClose = document.getElementById("activity-close");
const activityClear = document.getElementById("activity-clear");

let currentCmd = "";
let currentDomain = null;
let currentHostForToggle = null;
let allMods = [];
let filter = "current";
let autoSyncTriggered = false;

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

  if (resp?.unverified) {
    currentCmd = "";
    if (!autoSyncTriggered) {
      autoSyncTriggered = true;
      try {
        await chrome.tabs.create({
          url: "https://modcrew.dev/install",
          active: false,
        });
      } catch (e) {
        console.warn("[modcrew] auto-sync failed to open tab:", e);
      }
    }
    cmdEl.textContent = "Restoring your previous setup…";
    setupHint.textContent = "Keep this popup open for a second. Auto-finalizing now.";
    copyBtn.style.display = "none";
  } else if (resp?.mcpUrl) {
    currentCmd = buildCmd(resp.mcpUrl);
    cmdEl.textContent = currentCmd;
    copyBtn.style.display = "";
    setupHint.textContent = "Paste in your terminal where Claude Code runs.";
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

  // Site toggle: 反映当前 tab host
  currentHostForToggle = resp?.currentHost || null;
  if (currentHostForToggle) {
    siteToggleHost.textContent = currentHostForToggle;
    siteToggleHost.title = currentHostForToggle;
    siteToggle.checked = !resp.currentHostDisabled; // checked = 启用
    siteToggle.disabled = false;
  } else {
    siteToggleHost.textContent = "Site";
    siteToggle.disabled = true;
  }

  // Writes toggle
  if (typeof resp?.writesEnabled === "boolean") {
    writesToggle.checked = resp.writesEnabled;
  }
}

let archivedMods = [];
let expandedHistory = new Set(); // modId 集合：哪些 mod 展开了 version 列表
const versionsCache = new Map(); // modId → versions[]

async function loadMods() {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  try {
    currentDomain = tab?.url ? new URL(tab.url).hostname : null;
  } catch {
    currentDomain = null;
  }
  allMods = await chrome.runtime.sendMessage({ type: "get_all_mods" });
  if (!Array.isArray(allMods)) allMods = [];
  archivedMods = await chrome.runtime.sendMessage({ type: "list_archived" });
  if (!Array.isArray(archivedMods)) archivedMods = [];
  renderMods();
}

function fmtTimeShortMs(ts) {
  if (!ts) return "";
  const dt = Date.now() - ts;
  if (dt < 60000) return "just now";
  if (dt < 3600000) return `${Math.round(dt / 60000)}m ago`;
  if (dt < 86400000) return `${Math.round(dt / 3600000)}h ago`;
  return new Date(ts).toLocaleString();
}

function renderMods() {
  modsListEl.innerHTML = "";

  // Archived tab 单独走分支
  if (filter === "archived") {
    if (!archivedMods.length) {
      modsListEl.innerHTML = `<li class="empty">No archived mods.</li>`;
      return;
    }
    archivedMods.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
    for (const m of archivedMods) {
      const li = document.createElement("li");
      li.className = "mod-row archived";
      li.innerHTML = `
        <div class="mod-meta">
          <div class="mod-line">
            <span class="type-badge ${m.type}">${m.type}</span>
            <span class="intent">${escapeHtml(m.intent || "(inline)")}</span>
          </div>
          <div class="mod-sub">${escapeHtml(m.urlPattern || m.domain)} · archived ${fmtTimeShortMs(m.archivedAt)}</div>
        </div>
        <div class="mod-actions">
          <button class="link-btn restore" data-id="${m.id}" title="Restore this mod">↺</button>
          <button class="link-btn delete-hard" data-id="${m.id}" title="Delete forever">🗑</button>
        </div>
      `;
      modsListEl.appendChild(li);
    }
    modsListEl.querySelectorAll(".restore").forEach((b) =>
      b.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "restore_mod", id: b.dataset.id });
        await loadMods();
      })
    );
    modsListEl.querySelectorAll(".delete-hard").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Permanently delete this mod + all its history?")) return;
        await chrome.runtime.sendMessage({ type: "delete_mod", id: b.dataset.id, hard: true });
        archivedMods = archivedMods.filter((m) => m.id !== b.dataset.id);
        renderMods();
      })
    );
    return;
  }

  // current / all tabs
  const filtered =
    filter === "current" && currentDomain
      ? allMods.filter((m) => m.domain === currentDomain)
      : allMods;

  if (!filtered.length) {
    const msg =
      filter === "current"
        ? `No mods on <b>${currentDomain || "(this page)"}</b> yet. Ask Claude to make one.`
        : "No mods saved yet.";
    modsListEl.innerHTML = `<li class="empty">${msg}</li>`;
    return;
  }

  filtered.sort(
    (a, b) =>
      (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  );

  for (const m of filtered) {
    const li = document.createElement("li");
    li.className = "mod-row" + (m.enabled === false ? " disabled" : "");
    const versionCount = m.currentVersion || 1;
    const isExpanded = expandedHistory.has(m.id);
    li.innerHTML = `
      <div class="mod-head">
        <label class="toggle">
          <input type="checkbox" data-id="${m.id}" ${m.enabled !== false ? "checked" : ""} />
        </label>
        <div class="mod-meta">
          <div class="mod-line">
            <span class="type-badge ${m.type}">${m.type}</span>
            <span class="intent">${escapeHtml(m.intent || "(inline)")}</span>
            <button class="version-badge ${isExpanded ? "open" : ""}" data-id="${m.id}" title="${versionCount} version${versionCount > 1 ? "s" : ""}">v${versionCount} ${isExpanded ? "▴" : "▾"}</button>
          </div>
          <div class="mod-sub">${escapeHtml(m.urlPattern || m.domain)} · edited ${fmtTimeShortMs(m.updatedAt || m.createdAt)}</div>
        </div>
        <div class="mod-actions">
          <button class="link-btn view" data-id="${m.id}">View</button>
          <button class="link-btn delete" data-id="${m.id}" title="Archive (recoverable)">×</button>
        </div>
      </div>
      <div class="mod-history" data-id="${m.id}" style="${isExpanded ? "" : "display:none"}"></div>
    `;
    modsListEl.appendChild(li);
    if (isExpanded) renderHistory(m.id, li.querySelector(".mod-history"));
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

  modsListEl.querySelectorAll(".version-badge").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.id;
      if (expandedHistory.has(id)) expandedHistory.delete(id);
      else expandedHistory.add(id);
      renderMods();
    })
  );

  modsListEl.querySelectorAll(".view").forEach((b) =>
    b.addEventListener("click", () => {
      const mod = allMods.find((m) => m.id === b.dataset.id);
      if (!mod) return;
      modalTitle.textContent = `${mod.type} · ${mod.intent || "(inline)"} · v${mod.currentVersion || 1}`;
      modalContent.textContent = mod.content || "";
      modal.style.display = "flex";
    })
  );

  modsListEl.querySelectorAll(".delete").forEach((b) =>
    b.addEventListener("click", async () => {
      const mod = allMods.find((m) => m.id === b.dataset.id);
      if (!mod) return;
      // 默认走 archive (soft)，不 confirm —— archive 可恢复，不需要劝阻
      await chrome.runtime.sendMessage({ type: "delete_mod", id: mod.id });
      allMods = allMods.filter((m) => m.id !== mod.id);
      // archived 列表也更新（重 load）
      archivedMods = await chrome.runtime.sendMessage({ type: "list_archived" });
      renderMods();
    })
  );
}

async function renderHistory(modId, container) {
  let versions = versionsCache.get(modId);
  if (!versions) {
    versions = await chrome.runtime.sendMessage({
      type: "list_versions",
      modId,
    });
    versionsCache.set(modId, versions || []);
  }
  if (!Array.isArray(versions) || !versions.length) {
    container.innerHTML = '<div class="history-empty">No version history yet.</div>';
    return;
  }
  const mod = allMods.find((m) => m.id === modId);
  const headVersion = mod?.currentVersion || versions[0].version;
  container.innerHTML = "";
  for (const v of versions) {
    const isHead = v.version === headVersion;
    const row = document.createElement("div");
    row.className = "history-row" + (isHead ? " head" : "");
    row.innerHTML = `
      <span class="history-dot ${isHead ? "filled" : ""}"></span>
      <div class="history-meta">
        <div class="history-line">
          <span class="history-ver">v${v.version}</span>
          <span class="history-when">${fmtTimeShortMs(v.createdAt)}</span>
          ${v.author === "revert" ? '<span class="history-tag">revert</span>' : ""}
        </div>
        <div class="history-msg">${escapeHtml(v.intent || "")}</div>
      </div>
      <div class="history-actions">
        ${
          isHead
            ? '<span class="history-head-label">HEAD</span>'
            : `<button class="link-btn restore-ver" data-modid="${modId}" data-version="${v.version}">Restore</button>`
        }
      </div>
    `;
    container.appendChild(row);
  }
  container.querySelectorAll(".restore-ver").forEach((b) =>
    b.addEventListener("click", async () => {
      const modId = b.dataset.modid;
      const ver = parseInt(b.dataset.version, 10);
      b.disabled = true;
      b.textContent = "…";
      const resp = await chrome.runtime.sendMessage({
        type: "revert_to",
        modId,
        version: ver,
      });
      versionsCache.delete(modId); // 强制下次重读
      if (!resp?.ok) {
        alert("Revert failed: " + (resp?.error || "unknown"));
        b.disabled = false;
        b.textContent = "Restore";
        return;
      }
      await loadMods();
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

// === Site toggle ===
siteToggle.addEventListener("change", async () => {
  if (!currentHostForToggle) return;
  const disabled = !siteToggle.checked;
  await chrome.runtime.sendMessage({
    type: "set_host_disabled",
    host: currentHostForToggle,
    disabled,
  });
});

// === Writes toggle ===
writesToggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "set_writes_enabled",
    enabled: writesToggle.checked,
  });
});

// === Activity modal ===
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function renderActivity() {
  const entries = await chrome.runtime.sendMessage({ type: "get_audit", limit: 50 });
  if (!Array.isArray(entries) || !entries.length) {
    activityList.innerHTML = '<li class="empty">No MCP activity yet.</li>';
    return;
  }
  activityList.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    li.className = "activity-row " + (e.ok ? "ok" : "fail");
    li.innerHTML = `
      <div class="activity-head">
        <span class="activity-method">${escapeHtml(e.method || e.tool || "?")}</span>
        <span class="activity-time">${escapeHtml(fmtTime(e.timestamp))}</span>
      </div>
      <div class="activity-meta">
        <span class="activity-args">${escapeHtml(e.args || "")}</span>
        ${e.error ? `<span class="activity-err">${escapeHtml(e.error)}</span>` : ""}
        <span class="activity-dur">${fmtMs(e.durationMs ?? 0)}</span>
      </div>
    `;
    activityList.appendChild(li);
  }
}

openActivityBtn.onclick = async () => {
  activityModal.style.display = "flex";
  await renderActivity();
};
activityClose.onclick = () => (activityModal.style.display = "none");
activityModal.addEventListener("click", (e) => {
  if (e.target === activityModal) activityModal.style.display = "none";
});
activityClear.onclick = async () => {
  if (!confirm("Clear all MCP activity history?")) return;
  await chrome.runtime.sendMessage({ type: "clear_audit" });
  await renderActivity();
};

// === Pick element ===
function fmtTimeShort(ts) {
  const dt = Date.now() - ts;
  if (dt < 60000) return "just now";
  if (dt < 3600000) return `${Math.round(dt / 60000)}m ago`;
  return new Date(ts).toLocaleString();
}

async function refreshPicked() {
  const info = await chrome.runtime.sendMessage({ type: "get_last_picked" });
  if (!info?.selector) {
    pickedCard.style.display = "none";
    return;
  }
  pickedCard.style.display = "block";
  pickedSelector.textContent = info.selector;
  pickedTag.textContent = `<${info.tag}>`;
  pickedWhen.textContent = fmtTimeShort(info.pickedAt || Date.now());
}

pickElementBtn.onclick = async () => {
  const resp = await chrome.runtime.sendMessage({ type: "start_element_picker" });
  if (!resp?.ok) {
    alert("Couldn't start picker: " + (resp?.error || "unknown"));
    return;
  }
  // popup 接下来会因用户点页面而关闭。重开 popup 时 refreshPicked 会显示结果。
  window.close();
};

pickedCopy.onclick = async () => {
  const sel = pickedSelector.textContent;
  if (!sel) return;
  try {
    await navigator.clipboard.writeText(sel);
    pickedCopy.textContent = "✓ Copied";
    setTimeout(() => (pickedCopy.textContent = "Copy"), 1500);
  } catch {
    alert("Copy failed.");
  }
};

pickedClear.onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clear_last_picked" });
  await refreshPicked();
};

// === Last action banner (30s undo) ===
const lastActionBanner = document.getElementById("last-action-banner");
const actionMsg = document.getElementById("action-msg");
const actionSub = document.getElementById("action-sub");
const actionUndoBtn = document.getElementById("action-undo");
const actionDismissBtn = document.getElementById("action-dismiss");

async function refreshLastAction() {
  const a = await chrome.runtime.sendMessage({ type: "get_last_action" });
  if (!a) {
    lastActionBanner.style.display = "none";
    return;
  }
  const secs = Math.max(0, Math.ceil((a.expiresAt - Date.now()) / 1000));
  if (secs <= 0) {
    lastActionBanner.style.display = "none";
    return;
  }
  lastActionBanner.style.display = "flex";
  const label =
    a.type === "injectCss"
      ? "Injected CSS"
      : a.type === "injectJs"
      ? "Injected JS"
      : a.type;
  actionMsg.textContent = `${label}: ${a.intent || "(no message)"}`;
  actionSub.textContent = `${a.domain} · v${a.version} · ${secs}s left`;
}

actionUndoBtn.onclick = async () => {
  actionUndoBtn.disabled = true;
  actionUndoBtn.textContent = "…";
  const resp = await chrome.runtime.sendMessage({ type: "undo_last_action" });
  if (!resp?.ok) {
    alert("Undo failed: " + (resp?.error || "unknown"));
    actionUndoBtn.disabled = false;
    actionUndoBtn.textContent = "Undo";
    return;
  }
  lastActionBanner.style.display = "none";
  await loadMods();
};

actionDismissBtn.onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clear_last_action" });
  lastActionBanner.style.display = "none";
};

refreshStatus();
loadMods();
refreshPicked();
refreshLastAction();
setInterval(refreshStatus, 2000);
setInterval(refreshLastAction, 1000);
