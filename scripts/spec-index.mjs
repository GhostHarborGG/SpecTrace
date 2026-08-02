#!/usr/bin/env node
/**
 * Regenerates the requirement tables embedded in the narrative spec documents
 * from the requirement files themselves, so `specs/requirements/` stays the
 * single source of truth for title, priority, and status.
 *
 * A narrative document marks each table with a prefix selector:
 *
 *   <!-- spectrace:begin REQ-CORE-02 -->
 *   ...generated table...
 *   <!-- spectrace:end -->
 *
 * Everything between the markers is replaced by a table of the requirements
 * whose ID starts with that prefix, sorted by ID. The prefix families mirror
 * how the IDs were allocated (REQ-CORE-02x is retrieval, and so on), so a new
 * requirement file joins its section by existing — no narrative edit needed.
 *
 *   node scripts/spec-index.mjs           rewrite the tables
 *   node scripts/spec-index.mjs --check   exit 1 if any table is stale
 *
 * Repo tooling, not a specced requirement (same footing as the CI config).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const REQUIREMENTS_DIR = "specs/requirements";
const NARRATIVE_DOCS = ["specs/spectrace-core-spec.md", "specs/spectrace-cli-spec.md"];
const DEFAULT_PRIORITY = "P1"; // REQ-CORE-001: priority is optional.

const BLOCK = /(<!-- spectrace:begin ([A-Za-z0-9-]+) -->\r?\n)([\s\S]*?)(<!-- spectrace:end -->)/g;

/** Frontmatter of every requirement file, keyed by ID. */
function loadRequirements() {
  const requirements = [];
  for (const file of readdirSync(REQUIREMENTS_DIR).sort()) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(join(REQUIREMENTS_DIR, file), "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
    if (!match) throw new Error(`${file}: no YAML frontmatter`);
    const fm = parse(match[1]);
    if (!fm?.id) throw new Error(`${file}: frontmatter has no id`);
    if (`${fm.id}.md` !== file) throw new Error(`${file}: id ${fm.id} does not match filename`);
    requirements.push({
      id: fm.id,
      title: fm.title ?? "",
      priority: fm.priority ?? DEFAULT_PRIORITY,
      status: fm.status ?? "proposed"
    });
  }
  return requirements.sort((a, b) => a.id.localeCompare(b.id));
}

function renderTable(requirements, prefix) {
  const rows = requirements.filter((r) => r.id.startsWith(prefix));
  if (rows.length === 0) throw new Error(`no requirements match prefix "${prefix}"`);
  return [
    "| ID | Title | Priority | Status |",
    "|---|---|---|---|",
    ...rows.map((r) => `| [${r.id}](requirements/${r.id}.md) | ${r.title} | ${r.priority} | ${r.status} |`),
    ""
  ].join("\n");
}

const check = process.argv.includes("--check");
const requirements = loadRequirements();
const stale = [];

for (const doc of NARRATIVE_DOCS) {
  const original = readFileSync(doc, "utf8");
  let blocks = 0;
  const updated = original.replace(BLOCK, (_full, open, prefix, _body, close) => {
    blocks++;
    // Match the document's own line endings so the rewrite is a no-op on CRLF checkouts.
    const eol = open.endsWith("\r\n") ? "\r\n" : "\n";
    return open + renderTable(requirements, prefix).replace(/\n/g, eol) + close;
  });
  if (blocks === 0) throw new Error(`${doc}: no spectrace:begin markers found`);
  if (updated === original) continue;
  stale.push(doc);
  if (!check) writeFileSync(doc, updated, "utf8");
}

if (check) {
  if (stale.length > 0) {
    console.error(`Requirement tables are stale in:\n${stale.map((d) => `  ${d}`).join("\n")}`);
    console.error("Run `pnpm spec:index` to regenerate them.");
    process.exit(1);
  }
  console.log(`Requirement tables are up to date (${requirements.length} requirements).`);
} else {
  console.log(
    stale.length > 0
      ? `Regenerated tables in:\n${stale.map((d) => `  ${d}`).join("\n")}`
      : `Requirement tables already up to date (${requirements.length} requirements).`
  );
}
