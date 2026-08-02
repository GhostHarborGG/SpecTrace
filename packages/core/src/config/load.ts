/**
 * The filesystem boundary for configuration (REQ-CORE-004). An absent file is
 * not an error — it yields defaults plus a warning (AC1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "./parse.js";
import { CONFIG_FILE_RELATIVE_PATH, type ConfigLoadResult } from "./types.js";

/**
 * Reads `.spectrace/config.yaml` from `repositoryRoot`. Any read failure —
 * absent file, unreadable directory — falls back to defaults with a warning
 * rather than throwing, so no caller has to guard the happy path.
 */
export function loadConfig(repositoryRoot: string): ConfigLoadResult {
  let text: string | null = null;
  try {
    text = readFileSync(join(repositoryRoot, CONFIG_FILE_RELATIVE_PATH), "utf8");
  } catch {
    text = null;
  }
  return parseConfig(text);
}
