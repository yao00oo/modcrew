// modcrew JS API surface 文档
// 单 source of truth — modcrew_search 和 modcrew_execute 的 tool description 都引用这里

export const API_DOCS = `# modcrew JS API

This is the JavaScript API surface available inside \`modcrew_execute\`.

Your code runs as the body of an async function in the user's Chrome extension service worker. You have a single global: \`modcrew\`. Use \`return\` to send a value back.

## Methods

### modcrew.snapshot(tabId?)
Returns the active tab's accessibility tree, DOM summary, URL, title.
- \`tabId\` (number, optional): defaults to the user's active tab.

\`\`\`js
const snap = await modcrew.snapshot();
\`\`\`

### modcrew.findElement(intent, tabId?)
Find an element by semantic intent (NOT a CSS selector). Returns candidate selectors with confidence.
- \`intent\` (string, required): e.g. "Tweet compose button", "the search input"
- \`tabId\` (number, optional)

\`\`\`js
const match = await modcrew.findElement("the 'Subscribe' button");
\`\`\`

### modcrew.injectCss(css, opts?)
Inject CSS into the page. **ALWAYS saved** — auto-applies on every future visit matching \`urlPattern\`. Following Tweeks' model: every modification is a persistent userscript. To undo: \`modcrew.deleteMod(id)\`. To pause: \`modcrew.toggleMod(id, false)\`.
- \`css\` (string, required)
- \`opts\` (object, optional):
  - \`tabId\` (number)
  - \`urlPattern\` (string) — Greasemonkey @match. Examples: \`https://www.youtube.com/watch*\`, \`https://github.com/*\`, \`https://*/*\`. Defaults to current tab's whole domain. **Prefer narrow patterns**.
  - \`intent\` (string) — short label, shows up in the user's Library popup

There is **no** \`persist\` / \`preview\` / \`temporary\` flag. If the user asks for a change, save it. The Library UI is how they manage / undo.

\`\`\`js
await modcrew.injectCss('body { background: #2563eb }', {
  urlPattern: 'https://www.youtube.com/watch*',
  intent: 'Dark blue video pages',
});
\`\`\`

### modcrew.injectJs(code, opts?)
Same opts as \`injectCss\`. Runs in MAIN world. Same "always saved" semantics — no temporary mode.

\`\`\`js
await modcrew.injectJs(\`document.title = '🔥 ' + document.title;\`);
\`\`\`

### modcrew.screenshot(tabId?)
Returns a data URL of the visible viewport. Use after injecting to verify.

\`\`\`js
const shot = await modcrew.screenshot();
\`\`\`

### modcrew.fetch(url, opts?)
Cross-origin HTTP from inside a mod. Runs in the service worker, so the page's \`connect-src\` CSP doesn't apply. Equivalent in spirit to Tampermonkey's \`GM_xmlhttpRequest\`.

- \`url\` (string, required)
- \`opts\` (object, optional):
  - \`method\` (string, default \`'GET'\`)
  - \`headers\` (object)
  - \`body\` (string)
  - \`responseType\` — \`'text'\` (default) | \`'json'\` | \`'data-url'\` | \`'array'\`
    - \`'data-url'\`: returns a \`data:<mime>;base64,...\` string. Use this when you need to feed an external asset into a CSP-restricted page (\`<img src>\`, \`<iframe src>\`, etc.) — the data URL is allowed even when \`connect-src 'self'\` would block a direct fetch from the page.

Returns \`{status, statusText, ok, headers, body, url}\`.

\`\`\`js
// JSON
const { body } = await modcrew.fetch('https://api.example.com/x', { responseType: 'json' });

// 拉外部图片直接当 <img src> — 绕 connect-src 'self'
const img = await modcrew.fetch('https://cdn.example.com/a.png', { responseType: 'data-url' });
document.querySelector('#avatar').src = img.body;
\`\`\`

### modcrew.listTabs()
Returns \`[{tabId, url, title, active, windowId}]\` for all the user's open tabs. Use for cross-tab style transfer.

\`\`\`js
const tabs = await modcrew.listTabs();
const vercel = tabs.find(t => t.url.includes('vercel.com'));
const refSnap = await modcrew.snapshot(vercel.tabId);
\`\`\`

### modcrew.listMods(domain?)
List saved mods. Omit \`domain\` for all sites.

\`\`\`js
const youtubeMods = await modcrew.listMods('www.youtube.com');
\`\`\`

### modcrew.toggleMod(id, enabled)
Enable/disable a mod without deleting.

\`\`\`js
await modcrew.toggleMod('1716822437-abc12', false);
\`\`\`

### modcrew.deleteMod(id)
Permanently delete a saved mod.

### Page interaction

#### modcrew.click(selector, tabId?)
Click an element. Dispatches mousedown/mouseup/click so React/Vue handlers fire.

\`\`\`js
await modcrew.click('button[aria-label="Subscribe"]');
\`\`\`

#### modcrew.fill(selector, value, tabId?)
Fill an input / textarea / contenteditable. Uses the native value setter so framework-controlled inputs (React, etc.) update correctly. Dispatches \`input\` and \`change\` events.

\`\`\`js
await modcrew.fill('input[name="email"]', 'a@b.com');
\`\`\`

#### modcrew.hover(selector, tabId?)
Trigger \`mouseover/mouseenter/mousemove\` — useful for revealing hover-only menus.

#### modcrew.waitFor(selector, opts?)
Poll until the element exists (default) or is visible. Default timeout 5000ms (max 30000).
- \`opts.timeoutMs\` (number)
- \`opts.visible\` (boolean) — also require width>0, height>0, visibility !== "hidden"
- \`opts.tabId\` (number)

\`\`\`js
await modcrew.waitFor('.search-results', { timeoutMs: 8000, visible: true });
\`\`\`

### Element picker / user intent

#### modcrew.getLastPicked()
Returns the last element the **user** picked via the popup's "Pick element" button: \`{selector, tag, classes, text, rect, url, pickedAt}\`. Use this when the user says "this button" / "that thing I clicked" — they likely picked it first. If nothing was picked, returns \`null\`.

### Cross-session memory

#### modcrew.getValue(key, defaultValue?)  / modcrew.setValue(key, value) / modcrew.deleteValue(key) / modcrew.listValues(prefix?)
Per-extension KV store backed by IndexedDB. Value can be any JSON-serializable thing. Use it to remember things across Claude Code sessions — user preferences for a site, previous snapshot conclusions, selectors you identified before.

\`\`\`js
const prev = await modcrew.getValue('youtube:lastDarkCss');
if (prev) await modcrew.injectCss(prev);

await modcrew.setValue('youtube:lastDarkCss', generatedCss);
\`\`\`

### modcrew.saveMod({intent, content, contentType, urlPattern, tabId?})
Save a mod with a custom urlPattern (different from current page). Most of the time you don't need this — \`injectCss\`/\`injectJs\` already persist.

\`\`\`js
await modcrew.saveMod({
  intent: 'No newsletter popups, everywhere',
  contentType: 'css',
  content: '[class*=newsletter], [class*=popup] { display:none !important; }',
  urlPattern: 'https://*/*',
});
\`\`\`

## Multi-step patterns

### Inject and verify

\`\`\`js
await modcrew.injectCss('body { background: blue }');
return await modcrew.screenshot();
\`\`\`

### Cross-tab style transfer

\`\`\`js
const tabs = await modcrew.listTabs();
const ref = tabs.find(t => t.url.includes('vercel.com'));
const target = tabs.find(t => t.url.includes('github.com'));

const refSnap = await modcrew.snapshot(ref.tabId);
// Inspect refSnap, generate matching CSS, then:
await modcrew.injectCss(generatedCss, {
  tabId: target.tabId,
  urlPattern: 'https://github.com/*',
});
return await modcrew.screenshot(target.tabId);
\`\`\`

### Iterate until it looks right

\`\`\`js
// Each inject is saved. If you iterate, the previous attempts stay until
// you remove them. Two patterns:
//   1) Use the SAME urlPattern + intent so duplicates can be cleaned up later
//   2) Or modcrew.listMods() + modcrew.deleteMod(id) the old attempt first
await modcrew.injectCss(initialCss, { urlPattern: 'https://example.com/*', intent: 'darken' });
const shot = await modcrew.screenshot();
return shot;
\`\`\`

## Errors

If your code throws, the error message + stack trace are returned to you in the next turn. Just adjust and call \`modcrew_execute\` again. Iteration is the intended workflow.

## Anti-patterns

- ❌ Calling \`chrome.*\` directly — use \`modcrew.*\` instead. \`chrome.*\` may be available in scope but it's not part of the API contract and behavior may change.
- ❌ Looking for a \`persist\` / \`temporary\` / \`preview\` flag — **there isn't one**. Every modcrew.injectCss / injectJs is saved (Tweeks model). User undoes via deleteMod, not by you opting out of saving.
- ❌ Whole-domain \`urlPattern\` when only some pages are meant — narrow patterns preferred.
- ❌ Writing CSS without snapshotting first. \`body { background: X !important }\` loses to \`.card { background: white !important }\` (higher specificity). Read the page's actual selectors via snapshot, then override them with same specificity + !important.
`;
