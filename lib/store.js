import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from "node:fs";
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

/**
 * Coerce whatever the plan editor posts into the shape the engine reads.
 *
 * These plans are years of James's accumulated judgment — the real asset that
 * came out of the old workbook — so this is deliberately strict about structure
 * and deliberately permissive about extra fields it doesn't recognise (the 2025
 * rows carry a `wentAt2025` note of where each target actually went, and losing
 * that on the first save would be a quiet theft).
 */
function validatePlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("plan must be an object");
  }
  if (input.branches !== undefined && !Array.isArray(input.branches)) {
    throw new Error("plan.branches must be an array");
  }
  if (input.notes !== undefined && !Array.isArray(input.notes)) {
    throw new Error("plan.notes must be an array");
  }

  const round = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const notes = (input.notes || [])
    .map((n) => ({ ...obj(n), round: round(n?.round), text: String(n?.text ?? "") }))
    .filter((n) => n.round !== null && n.text.trim())
    .sort((a, b) => a.round - b.round);

  const branches = (input.branches || []).map((b, i) => ({
    ...obj(b),
    id: String(b?.id || `branch-${i + 1}`),
    label: String(b?.label || `Plan ${i + 1}`),
    named: Boolean(b?.named),
    picks: (Array.isArray(b?.picks) ? b.picks : [])
      .map((t) => ({ ...obj(t), round: round(t?.round), player: String(t?.player ?? "").trim() }))
      .filter((t) => t.round !== null && t.player)
      .sort((a, c) => a.round - c.round),
  }));

  return { ...input, notes, branches };
}

function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
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
      const clean = validatePlan(nextPlan);
      // One copy back. Losing the plans to a bad save is the only data loss in
      // this app that couldn't be reconstructed from the sheet and the exports.
      if (existsSync(branchesPath)) copyFileSync(branchesPath, `${branchesPath}.bak`);
      plan = clean;
      writeJson(branchesPath, plan);
      return plan;
    },
  };
}
