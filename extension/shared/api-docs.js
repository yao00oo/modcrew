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
Inject CSS into the page. **ALWAYS saved + linear version history + post-inject verification**.

Returns \`{ ok, modId, version, verifyReport }\`. The \`verifyReport\` runs \`getComputedStyle\` on sampled matched elements and tells you whether each rule actually took effect:

\`\`\`
{
  rulesChecked: 5,
  rulesEffective: 3,
  rulesBlocked: 1,           // 0 of N elements got the expected value (higher-specificity won)
  rulesPartial: 1,           // some matched, some didn't
  topBlockers: [             // class names appearing on un-affected elements — likely winners
    { class: '.bg-white', hits: 6 },
    { class: '.card', hits: 4 }
  ],
  summary: '3/5 effective, 1 blocked, 1 partial. Likely blocker classes: .bg-white(6×), .card(4×). Try writing more specific selectors targeting them.',
  details: [...]
}
\`\`\`

**Use the report**: if \`rulesEffective < rulesChecked\`, re-inject with a more specific selector. Don't rely on the user telling you it didn't work.

- \`css\` (string, required)
- \`opts\` (object, optional):
  - \`modId\` (string) — **if set, appends a new version on that existing mod** (HEAD advances). If omitted, creates a brand-new mod (v1).
  - \`tabId\` (number)
  - \`urlPattern\` (string) — Greasemonkey @match. Examples: \`https://www.youtube.com/watch*\`, \`https://github.com/*\`, \`https://*/*\`. Defaults to current tab's whole domain.
  - \`intent\` (string) — short label / "commit message". Shows in popup + version history.

**UPDATE vs CREATE rule (read this — most LLM bugs come from getting this wrong):**

When the user says "再深一点" / "改一下刚才那个" / "调整下" / "再试试" / similar iteration phrases:
  1. listMods() first to find the recent target
  2. Pass that mod's id as \`opts.modId\`
  3. New version gets appended; old version stays in history (user can revert)

When the user says "再加一个" / "另一个" / "新的 X" / a clearly different intent:
  - Omit modId → new mod

If \`modId\` is provided and the content is byte-identical to current HEAD → noop (no duplicate version). Idempotent.

There is **no** \`persist\` / \`preview\` / \`temporary\` flag.

\`\`\`js
// First time: create
const a = await modcrew.injectCss('body { background: #2563eb }', {
  urlPattern: 'https://www.youtube.com/watch*',
  intent: 'Blue video pages',
});  // → { modId: 'X', version: 1 }

// User says "再深一点"
const mods = await modcrew.listMods('www.youtube.com');
// pick the most recent one (sort by lastModifiedAt or recencyHint === 'last_session')
await modcrew.injectCss('body { background: #1e3a8a }', {
  modId: mods[0].id,                          // ← key: update existing
  intent: 'Deeper blue video pages',
});  // → { modId: 'X', version: 2 }
\`\`\`

### modcrew.injectJs(code, opts?)
Same opts as \`injectCss\` (including \`modId\` for iteration). Runs in MAIN world. Same "always saved + version history" semantics.

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

### modcrew.listMods(domain?, opts?)
List saved (non-archived) mods. \`opts.includeArchived\` to also include archived.

Each entry now includes **iteration hints**:
- \`versionCount\` — number of revisions on this mod
- \`lastModifiedAt\` — timestamp of HEAD
- \`recencyHint\` — \`'last_session' | 'recent' | 'today' | 'older'\` — use this to find the right mod to update when user says "改一下刚才那个"

\`\`\`js
const mods = await modcrew.listMods('www.youtube.com');
// Find the mod the user just made
const target = mods.find(m => m.recencyHint === 'last_session') || mods[0];
\`\`\`

### modcrew.toggleMod(id, enabled)
Enable/disable a mod without deleting.

\`\`\`js
await modcrew.toggleMod('1716822437-abc12', false);
\`\`\`

### modcrew.deleteMod(id, opts?)
**Soft-deletes by default** (archive — recoverable from popup → Archived tab, or via \`restoreMod\`).
- \`opts.hard\` (boolean) — pass \`true\` for permanent deletion (mod + all version history). Avoid unless user explicitly confirms.

### modcrew.archiveMod(id) / modcrew.restoreMod(id)
Explicit soft delete + un-delete. \`archiveMod\` = same as default \`deleteMod\`. \`restoreMod\` brings it back, re-applies CSS / re-registers userScript.

### modcrew.listVersions(modId) / getVersion(modId, version) / revertTo(modId, version)

History primitives.

- \`listVersions(modId)\` → array \`[{version, intent, urlPattern, author, createdAt, contentPreview, contentLength}, ...]\` newest-first
- \`getVersion(modId, version)\` → full row including \`content\`
- \`revertTo(modId, version)\` → appends a new version with \`content\` copied from the target version (HEAD advances, history preserved). Use when user says "回到上一版" / "撤销刚才那个改" / "回到 v2".

\`\`\`js
// User: "回上一版"
const versions = await modcrew.listVersions(modId);
// versions[0] is HEAD (just-made bad change), versions[1] is the previous one
await modcrew.revertTo(modId, versions[1].version);
\`\`\`

### modcrew.listArchivedMods(domain?)
List soft-deleted mods (optionally filtered by domain). Each item includes \`archivedAt\` timestamp.

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

#### Batch KV — \`modcrew.getValues([k1, k2, ...]) / setValues({k1: v1, k2: v2, ...}) / deleteValues([...])\`
Atomic batch operations on the KV store. Equivalent to Tampermonkey/Violentmonkey \`GM_getValues/GM_setValues\` (v5.3+).

\`\`\`js
await modcrew.setValues({ 'crushon:state': {...}, 'crushon:lastChat': 'abc' });
const { 'crushon:state': s, 'crushon:lastChat': c } = await modcrew.getValues(['crushon:state', 'crushon:lastChat']);
\`\`\`

#### modcrew.addValueChangeListener({ key, code, urlPattern? })
Run \`code\` (a JS source string) in MAIN world whenever a key changes. Receives \`this = { key, value, oldValue, op }\` inside the callback body. Persists as a normal mod — survives reloads. To remove: \`modcrew.listMods()\` → find the entry with intent \`kv-listener:KEY\` → \`modcrew.deleteMod(id)\`.

\`\`\`js
await modcrew.addValueChangeListener({
  key: 'crushon:stageState',
  urlPattern: 'https://crushon.ai/*',
  code: 'document.querySelector("#stage-debug").textContent = JSON.stringify(this.value);',
});
\`\`\`

### Context menu — \`modcrew.menu / unregisterMenu / listMenus\`
Register a persistent right-click item under "ModCrew → ...". When the user clicks it, \`code\` runs in the target tab. Equivalent in spirit to \`GM_registerMenuCommand\` (but stored across sessions, not per-userscript).

\`\`\`js
const { id } = await modcrew.menu({
  label: 'Toggle dark mode',
  urlPattern: 'https://crushon.ai/*',
  code: 'document.documentElement.classList.toggle("dark")',
});
await modcrew.unregisterMenu(id);
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

### Cookies — \`modcrew.cookie.{get,list,set,delete}\`
Equivalent to Tampermonkey's \`GM_cookie\`. Runs in service worker so HttpOnly cookies are visible.

\`\`\`js
const c = await modcrew.cookie.get({ url: 'https://example.com', name: 'session' });
const all = await modcrew.cookie.list({ domain: 'example.com' });
await modcrew.cookie.set({ url: 'https://example.com', name: 'foo', value: 'bar', expirationDate: Math.floor(Date.now()/1000) + 3600 });
await modcrew.cookie.delete({ url: 'https://example.com', name: 'foo' });
\`\`\`

### Clipboard — \`modcrew.clipboardWrite(text, tabId?)\`
Equivalent to \`GM_setClipboard\`. Tries \`navigator.clipboard\` in the target tab first; falls back to an offscreen \`execCommand("copy")\`.

\`\`\`js
await modcrew.clipboardWrite('hello');
\`\`\`

### Desktop notification — \`modcrew.notification(opts)\`
Equivalent to \`GM_notification\`. Accepts a string or \`{ title, message, iconUrl, image, timeout, silent, requireInteraction }\`.

\`\`\`js
await modcrew.notification({ title: 'Done', message: 'Style applied.', timeout: 4000 });
\`\`\`

### Tab control — \`modcrew.openTab(url, opts?) / closeTab(tabId) / getTab(tabId)\`
Equivalent to \`GM_openInTab\` + variations. \`opts\`: \`{ active, windowId, index, pinned }\`. Returns \`{tabId, url, windowId}\`.

\`\`\`js
const { tabId } = await modcrew.openTab('https://example.com', { active: false });
const info = await modcrew.getTab(tabId);
await modcrew.closeTab(tabId);
\`\`\`

### Downloads — \`modcrew.download(opts) / downloadCancel(downloadId)\`
Equivalent to \`GM_download\`. \`opts\`: \`{ url, filename?, saveAs?, conflictAction? }\` (\`conflictAction\` is "uniquify" | "overwrite" | "prompt"). Returns \`{downloadId}\`.

\`\`\`js
const { downloadId } = await modcrew.download({ url: 'https://example.com/a.zip', filename: 'a.zip' });
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
- ❌ Looking for a \`persist\` / \`temporary\` / \`preview\` flag — **there isn't one**. Every modcrew.injectCss / injectJs is saved + versioned. User undoes via revertTo or archiveMod, not by you opting out of saving.
- ❌ When user iterates ("再深一点"), creating a NEW mod instead of passing \`opts.modId\`. Always listMods first, find the recent target, pass its id.
- ❌ Whole-domain \`urlPattern\` when only some pages are meant — narrow patterns preferred.
- ❌ Writing CSS without snapshotting first. \`body { background: X !important }\` loses to \`.card { background: white !important }\` (higher specificity). Read the page's actual selectors via snapshot, then override them with same specificity + !important.
`;
