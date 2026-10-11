#!/data/data/com.termux/files/usr/bin/bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

node -e '
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve("./package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
let notes = [];

try {
  const log = execSync("git log -n 12 --pretty=format:%s", { encoding: "utf8" });
  notes = log.split("\n")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("Merge") && !s.startsWith("bump") && !s.includes("subagent") && !s.includes("wip"))
    .slice(0, 6)
    .map(s => s.replace(/^[a-z]+(\([a-z0-9_-]+\))?:\s*/i, "").trim())
    .filter(Boolean);
} catch (e) {
  console.warn("Failed to read git log:", e.message);
}

if (notes.length === 0) {
  notes = [`Latest updates and enhancements for v${pkg.version}`];
}

const versionData = {
  version: pkg.version,
  name: "Vyapar Books PRO",
  buildTime: new Date().toISOString(),
  repository: "nurmd/webapp",
  channel: "stable",
  releaseNotes: notes
};

fs.writeFileSync("./public/version.json", JSON.stringify(versionData, null, 2) + "\n");
console.log(`[VersionGen] Updated public/version.json for v${pkg.version} with ${notes.length} notes`);
'
