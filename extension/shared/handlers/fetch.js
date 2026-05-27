// Cross-origin fetch from inside a mod.
// SW 端跑，绕开页面的 connect-src CSP（扩展 host_permissions: <all_urls>）。
//
// responseType:
//   'text' (default) — body 为字符串
//   'json'           — body 为已解析对象
//   'data-url'       — body 为 data:<mime>;base64,... 可直接当 src 用
//   'array'          — body 为 number[]（postMessage 安全的 Uint8Array 序列化）

export async function handleFetch(url, opts = {}) {
  const { method = "GET", headers = {}, body, responseType = "text" } = opts;
  const resp = await fetch(url, { method, headers, body });

  const respHeaders = {};
  resp.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  let respBody;
  if (responseType === "json") {
    respBody = await resp.json();
  } else if (responseType === "array") {
    const ab = await resp.arrayBuffer();
    respBody = Array.from(new Uint8Array(ab));
  } else if (responseType === "data-url") {
    const ab = await resp.arrayBuffer();
    const u8 = new Uint8Array(ab);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const b64 = btoa(bin);
    const mime = resp.headers.get("content-type") || "application/octet-stream";
    respBody = `data:${mime};base64,${b64}`;
  } else {
    respBody = await resp.text();
  }

  return {
    status: resp.status,
    statusText: resp.statusText,
    ok: resp.ok,
    headers: respHeaders,
    body: respBody,
    url: resp.url,
  };
}
