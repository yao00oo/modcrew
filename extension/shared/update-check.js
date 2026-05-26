// 自更新检查
// 每天 1 次去 GitHub Releases 看是不是有新版
// 有新版 → 写到 chrome.storage，panel 显示一条提示
//
// Chrome 不让 unpacked extension 自动更新二进制，
// 但我们可以提示用户去下载新版。

const LATEST_URL = "https://api.github.com/repos/yao00oo/modcrew/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function checkForUpdate(currentVersion) {
  try {
    const r = await fetch(LATEST_URL, {
      headers: { accept: "application/vnd.github+json" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    if (!latest) return null;
    if (compareVersions(latest, currentVersion) > 0) {
      return {
        latest,
        url: data.html_url,
        zipUrl: data.assets?.[0]?.browser_download_url,
        notes: data.body || "",
      };
    }
    return null;
  } catch (e) {
    console.warn("[modcrew] update check failed:", e);
    return null;
  }
}

export async function maybeCheck() {
  const data = await chrome.storage.local.get(["lastUpdateCheck", "updateInfo"]);
  const now = Date.now();
  if (data.lastUpdateCheck && now - data.lastUpdateCheck < CHECK_INTERVAL_MS) {
    return data.updateInfo || null;
  }
  const current = chrome.runtime.getManifest().version;
  const info = await checkForUpdate(current);
  await chrome.storage.local.set({ lastUpdateCheck: now, updateInfo: info });
  return info;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}
