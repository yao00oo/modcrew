// Desktop notification — 对标 GM_notification.
// 权限：manifest "notifications"

export async function handleNotification(opts = {}) {
  if (typeof opts === "string") opts = { message: opts };
  const {
    title = "ModCrew",
    message = "",
    iconUrl,
    image,
    timeout,
    silent,
    requireInteraction,
  } = opts;
  if (!message) throw new Error("notification requires `message`");

  const notifId = `modcrew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const opts2 = {
    type: image ? "image" : "basic",
    title,
    message,
    iconUrl: iconUrl || chrome.runtime.getURL("icons/icon128.png"),
    silent: silent === true,
    requireInteraction: requireInteraction === true,
  };
  if (image) opts2.imageUrl = image;

  await new Promise((resolve, reject) => {
    chrome.notifications.create(notifId, opts2, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });

  // 可选 auto-close
  if (typeof timeout === "number" && timeout > 0) {
    setTimeout(() => {
      try { chrome.notifications.clear(notifId); } catch {}
    }, timeout);
  }

  return { ok: true, notifId };
}
