const statusEl = document.getElementById("status");
const cmdEl = document.getElementById("mcp-cmd");
const copyBtn = document.getElementById("copy-btn");
const setupHint = document.getElementById("setup-hint");
const domainEl = document.getElementById("current-domain-name");
const modsListEl = document.getElementById("mods-list");
const updateBanner = document.getElementById("update-banner");
const regenBtn = document.getElementById("regen-btn");

let currentCmd = "";

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

async function refreshMods() {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url) return;
  let domain;
  try {
    domain = new URL(tab.url).hostname;
  } catch {
    return;
  }
  domainEl.textContent = domain;

  const mods = await chrome.runtime.sendMessage({
    type: "get_mods_for_domain",
    domain,
  });
  modsListEl.innerHTML = "";
  if (!mods || !mods.length) {
    modsListEl.innerHTML = '<li class="empty">No mods on this site yet.</li>';
    return;
  }
  for (const m of mods) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="type-badge">${m.type}</span>${m.intent || "(inline)"}`;
    modsListEl.appendChild(li);
  }
}

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

refreshStatus();
refreshMods();
setInterval(refreshStatus, 2000);
