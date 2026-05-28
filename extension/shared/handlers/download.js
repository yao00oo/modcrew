// Download — 对标 GM_download.
// 权限：manifest "downloads"

export async function handleDownload(opts = {}) {
  if (typeof opts === "string") opts = { url: opts };
  const { url, filename, saveAs, conflictAction } = opts;
  if (!url || typeof url !== "string") throw new Error("download: url required");

  const downloadOpts = { url };
  if (filename) downloadOpts.filename = filename;
  if (saveAs === true) downloadOpts.saveAs = true;
  if (conflictAction) downloadOpts.conflictAction = conflictAction;

  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download(downloadOpts, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
  return { ok: true, downloadId };
}

export async function handleDownloadCancel(downloadId) {
  if (typeof downloadId !== "number") throw new Error("downloadCancel: downloadId required");
  await new Promise((resolve) => chrome.downloads.cancel(downloadId, resolve));
  return { ok: true };
}
