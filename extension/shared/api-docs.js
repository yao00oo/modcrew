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
