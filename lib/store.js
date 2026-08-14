import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Plain JSON files on disk. Deliberately boring: the deferred phase-2 idea is to
 * layer podcast-transcript search over this data, and flat files won't fight
 * that later the way a bespoke binary format would.
 *
 * Writes go through a temp file + rename so an interrupted save can't leave
 * James with a corrupted inventory an hour before the draft.
 */

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`[store] ${path} is unreadable (${err.message}); using default.`);
    return fallback;
  }
}

function writeJson(path, value) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export function createStore(dataDir, season) {
  const inventoryPath = join(dataDir, `inventory.${season}.json`);
  const branchesPath = join(dataDir, `branches.${season}.json`);

  let inventory = readJson(inventoryPath, { players: {} });
  if (!inventory.players) inventory.players = {};
  let plan = readJson(branchesPath, { notes: [], branches: [] });

  return {
    get inventory() {
      return inventory;
    },
    get plan() {
      return plan;
    },

    /** Toggle or set a star, tags, or note on one player. Merges, never clobbers. */
    updatePlayer(id, patch) {
      const cur = inventory.players[id] || { starred: false, tags: [], note: "" };
      const next = { ...cur };
      if ("starred" in patch) next.starred = Boolean(patch.starred);
      if ("tags" in patch) next.tags = [...new Set(patch.tags)].filter(Boolean);
      if ("note" in patch) next.note = String(patch.note);

      // Don't keep empty records around — they'd accumulate as noise.
      if (!next.starred && !next.tags.length && !next.note) {
        delete inventory.players[id];
      } else {
        inventory.players[id] = next;
      }
      writeJson(inventoryPath, inventory);
      return inventory.players[id] || null;
    },

    savePlan(nextPlan) {
      plan = nextPlan;
      writeJson(branchesPath, plan);
      return plan;
    },
  };
}
