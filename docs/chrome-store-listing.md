# Chrome Web Store 提交资料

## 基本信息

**Extension name**: ModCrew

**Short description** (132 chars max):
> Mod the web. Together. AI-powered browser customization powered by your Claude Code subscription.

**Detailed description**:
```
ModCrew lets you modify any website with natural language — using YOUR Claude Code subscription. No extra LLM bills, no API keys to manage.

✨ How it works:
1. Tell Claude Code what you want changed ("hide the YouTube sidebar", "make the search bar black")
2. ModCrew's agentic loop snapshots the page, generates CSS/JS, verifies via screenshot, and persists
3. Your mods auto-apply on every visit

🎯 Why ModCrew (vs Tweeks etc.):
• Uses your existing Claude Code subscription — $0 extra
• Full agentic loop (Claude verifies its own work via screenshots)
• Privacy-first: pages never leave your machine for AI processing
• Cross-device sync via Cloudflare Workers
• Open source: github.com/yao00oo/modcrew

🛠 What you can mod:
• Hide ads, sidebars, infinite-scroll feeds
• Restyle any element (colors, fonts, layout)
• Add buttons, shortcuts, content extractors
• Anything CSS/JS can do — described in plain English

📦 Setup (30 seconds):
1. Install this extension
2. Visit modcrew.dev/install
3. Copy one command into Claude Code
4. Done — start modding

Build the internet you want to use.
```

**Category**: Developer Tools (or Productivity)

**Language**: English (primary), Simplified Chinese (secondary)

## 隐私

**Single purpose**: Allow users to modify any website using their own Claude Code AI subscription.

**Permission justifications**:
- `activeTab` + `scripting`: Execute CSS/JS modifications on user-active tabs as requested by user's Claude Code
- `storage` + `unlimitedStorage`: Save user's mods to IndexedDB for auto-apply
- `tabs`: Identify current tab for mod scoping
- `alarms`: Keep service worker alive for WebSocket connection
- `sidePanel`: Display mod management UI
- `host_permissions: <all_urls>`: User must be able to mod any site they choose
- `externally_connectable` (modcrew.dev): Receive pairing token from install page

**Data usage**:
- We do NOT collect personal data
- We do NOT use data for ads
- We do NOT sell data to third parties
- Pages content is sent to user's own Claude Code via secure relay (api.modcrew.dev), then deleted from memory

## 截图（待制作）

需要：
- 1280x800 主截图 × 3-5 张
- 显示安装流程 + 实际改造场景
- 显示 side panel UI

## 提交步骤

1. https://chrome.google.com/webstore/devconsole
2. 一次性付 $5（开发者注册费）
3. New Item → 上传 /tmp/modcrew-extension-0.3.0.zip
4. 填上面的资料
5. 提交审核（通常 1-3 天）

## Privacy Policy

需要一个 URL：modcrew.dev/privacy
（暂时跳，先提交，审核时补）
