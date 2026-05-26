const statusEl = document.getElementById("status");
const connTextEl = document.getElementById("connection-text");
const domainEl = document.getElementById("current-domain-name");
const modsListEl = document.getElementById("mods-list");

async function refreshStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "get_status" });
  if (resp?.connected) {
    statusEl.textContent = "● Connected";
    statusEl.className = "status connected";
    connTextEl.innerHTML = `Paired. Talk to Claude Code:<br><code>用 modcrew snapshot 看当前 tab</code>`;
  } else if (resp?.token) {
    statusEl.textContent = "● Connecting...";
    statusEl.className = "status disconnected";
    connTextEl.textContent = "Token saved, reconnecting...";
  } else {
    statusEl.textContent = "● Not paired";
    statusEl.className = "status disconnected";
    connTextEl.innerHTML =
      'Not paired. Visit <a href="https://modcrew.dev/install" target="_blank">modcrew.dev/install</a>';
  }

  // 更新提示
  const banner = document.getElementById("update-banner");
  if (resp?.update) {
    const u = resp.update;
    banner.style.display = "block";
    banner.innerHTML =
      `🎉 New version <b>v${u.latest}</b> available (you have v${resp.version}). ` +
      `<a href="${u.zipUrl || u.url}" target="_blank">Download</a> · ` +
      `<a href="${u.url}" target="_blank">What's new</a>`;
  } else {
    banner.style.display = "none";
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
    modsListEl.innerHTML = '<li style="color:#aaa">No mods yet on this site.</li>';
    return;
  }
  for (const m of mods) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="type-badge">${m.type}</span>${m.intent || "(inline)"}`;
    modsListEl.appendChild(li);
  }
}

refreshStatus();
refreshMods();
setInterval(refreshStatus, 2000);
