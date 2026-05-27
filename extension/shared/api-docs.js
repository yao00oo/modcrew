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
Inject CSS into the page. **Persists by default** — auto-applies on every future visit matching \`urlPattern\`.
- \`css\` (string, required)
- \`opts\` (object, optional):
  - \`tabId\` (number)
  - \`persist\` (boolean, default true) — pass false for one-shot
  - \`urlPattern\` (string) — Greasemonkey @match. Examples: \`https://www.youtube.com/watch*\`, \`https://github.com/*\`, \`https://*/*\`. Defaults to current tab's whole domain. **Prefer narrow patterns**.
  - \`intent\` (string) — short label, shows up in the user's Library popup

\`\`\`js
await modcrew.injectCss('body { background: #2563eb }', {
  urlPattern: 'https://www.youtube.com/watch*',
  intent: 'Dark blue video pages',
});
\`\`\`

### modcrew.injectJs(code, opts?)
Same opts as \`injectCss\`. Runs in MAIN world.

\`\`\`js
await modcrew.injectJs(\`document.title = '🔥 ' + document.title;\`);
\`\`\`

### modcrew.screenshot(tabId?)
Returns a data URL of the visible viewport. Use after injecting to verify.

\`\`\`js
const shot = await modcrew.screenshot();
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
let attempt = 0;
let lastShot;
while (attempt++ < 3) {
  await modcrew.injectCss(currentCss, {persist: false});
  lastShot = await modcrew.screenshot();
  // (caller inspects lastShot, adjusts CSS, calls execute again)
  break;
}
return lastShot;
\`\`\`

## Errors

If your code throws, the error message + stack trace are returned to you in the next turn. Just adjust and call \`modcrew_execute\` again. Iteration is the intended workflow.

## Anti-patterns

- ❌ Calling \`chrome.*\` directly — use \`modcrew.*\` instead. \`chrome.*\` may be available in scope but it's not part of the API contract and behavior may change.
- ❌ \`persist: false\` when the user said "make it blue" — they want it to last.
- ❌ Whole-domain \`urlPattern\` when only some pages are meant — Tweeks-style narrow patterns are preferred.
`;
