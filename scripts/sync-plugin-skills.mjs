#!/usr/bin/env node
// Codex plugin installs copy the plugin directory and skip symlinks, so
// plugins/openseo/skills/* must be real files, not symlinks to .agents/skills/*.
// Run this after editing any of the skills listed below. `pnpm ci:check` runs
// this and diffs the result, so a stale copy fails CI instead of shipping.
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = join(repoRoot, ".agents/skills");
const targetDir = join(repoRoot, "plugins/openseo/skills");

const skills = [
  "competitive-landscape",
  "competitor-analysis",
  "keyword-clustering",
  "keyword-research",
  "link-prospecting",
  "local-seo",
  "seo-audit",
  "seo-coach",
  "seo-project-setup",
  "seo-report",
];

// Replace only the skills listed above. Plugin-only skills that have no copy in
// .agents/skills (draft-stress-test, gap-plan) live straight in the plugin
// folder and must survive the sync. A skill dropped from the list needs its
// plugin folder deleted by hand.
for (const skill of skills) {
  rmSync(join(targetDir, skill), { recursive: true, force: true });
  cpSync(join(sourceDir, skill), join(targetDir, skill), {
    recursive: true,
    dereference: true,
  });
}

console.log(`Synced ${skills.length} skills into plugins/openseo/skills/`);
