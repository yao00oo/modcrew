#!/usr/bin/env node
// modcrew-mcp: convenience CLI that opens the install page
// The actual MCP relay is hosted at api.modcrew.dev — no local server needed.

const { spawn } = require("node:child_process");
const url = "https://modcrew.dev/install";

console.log("[modcrew] Opening installer:", url);
console.log("[modcrew] Copy the 'claude mcp add' command shown on the page.");

const cmd = process.platform === "darwin" ? "open"
          : process.platform === "win32" ? "start"
          : "xdg-open";
try {
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
} catch {
  // fall through
}
