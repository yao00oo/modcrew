# ModCrew

**Mod the web. Together.**

AI-powered browser modification — using your own Claude Code subscription.

## What it is

A Chrome extension that lets you modify any website with natural language. Powered by your local Claude Code via Cloud SSE MCP relay.

- **No LLM cost for us** — uses your Claude Code subscription
- **No local daemon** — Cloud Relay handles bridging
- **No NMH install** — just MCP add + Chrome extension
- **Cross-device sync** — your account, your mods

## Quick install

```bash
# In Claude Code:
claude mcp add modcrew --transport http https://api.modcrew.dev/mcp/<your-token>
```

Then:
1. Visit https://modcrew.dev/install
2. Click "Add to Chrome"
3. Done

## Repo structure

```
worker/       Cloudflare Worker (SSE MCP + WebSocket relay)
extension/    Chrome extension (Manifest V3)
site/         modcrew.dev static site + /install page
docs/         Architecture spec, decisions
```

## Status

V3 in development. See `docs/spec.md`.
