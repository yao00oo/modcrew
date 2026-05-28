// Cookie API — 对标 GM_cookie。
// 在 sw 端跑，绕开页面 JS 拿 HttpOnly cookie 的限制。
// 权限：manifest "cookies" + host_permissions <all_urls>

function normalizeDetails(d = {}) {
  const out = {};
  if (d.url) out.url = d.url;
  if (d.name) out.name = d.name;
  if (d.domain) out.domain = d.domain;
  if (d.path) out.path = d.path;
  if (d.storeId) out.storeId = d.storeId;
  return out;
}

export async function handleCookieGet(opts = {}) {
  if (!opts.url || !opts.name) {
    throw new Error("cookie.get requires { url, name }");
  }
  return chrome.cookies.get(normalizeDetails(opts));
}

export async function handleCookieList(opts = {}) {
  // 过滤参数都可选；不传就拿全部（按当前 store）
  return chrome.cookies.getAll(normalizeDetails(opts));
}

export async function handleCookieSet(opts = {}) {
  if (!opts.url) throw new Error("cookie.set requires { url, ... }");
  const allowed = [
    "url",
    "name",
    "value",
    "domain",
    "path",
    "secure",
    "httpOnly",
    "sameSite",
    "expirationDate",
    "storeId",
    "partitionKey",
  ];
  const details = {};
  for (const k of allowed) if (k in opts) details[k] = opts[k];
  return chrome.cookies.set(details);
}

export async function handleCookieDelete(opts = {}) {
  if (!opts.url || !opts.name) {
    throw new Error("cookie.delete requires { url, name }");
  }
  return chrome.cookies.remove(normalizeDetails(opts));
}
