import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Shared paths and config loading for the ingest tools. */

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "data");

/** MM_DD_YY, the naming convention used across this workspace. */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}_${p(d.getDate())}_${String(d.getFullYear()).slice(2)}`;
}

/**
 * config.json holds the FFB credentials next to the Google API key. It is
 * gitignored, and nothing here ever prints its contents.
 */
export async function loadIngestConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  } catch {
    // No config yet is fine as long as a saved session exists.
  }
  return {
    // Which season to PULL. Always the current year unless asked otherwise --
    // "refresh the rankings" means this year's rankings. Which season the app
    // DISPLAYS is config.season, and during a migration those two differ: the
    // 2026 pool can exist on disk before the app is switched over to it.
    season: new Date().getFullYear(),
    ffb: cfg.ffb ?? {},
  };
}
