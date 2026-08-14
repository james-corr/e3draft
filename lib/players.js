import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The player pool: FantasyPros consensus ranks/tiers as the base list, enriched
 * with Fantasy Footballers tier/risk/ADP/upside.
 *
 * The one job that matters most here is name matching. Leaguemates type player
 * names into the shared sheet by hand under time pressure, so "D.K. Metcalf",
 * "DK Metcalf" and "dk metcalf " all have to land on the same player. Anything
 * we fail to match gets surfaced loudly in the UI rather than silently dropped —
 * a pick that doesn't register would leave a drafted player showing as available,
 * which is the single worst thing this app could get wrong on draft day.
 */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Aggressive normalization for matching only — never for display. */
export function normalizeName(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[.'’`]/g, "")     // D.K. -> DK, Ja'Marr -> JaMarr
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part && !SUFFIXES.has(part))
    .join(" ");
}

export function loadPlayers(dataDir, season) {
  const file = join(dataDir, `players.${season}.json`);
  const raw = JSON.parse(readFileSync(file, "utf8"));

  const players = raw.map((p) => ({
    ...p,
    norm: normalizeName(p.name),
  }));

  // One human can hold two rows (a two-way player is listed at each position),
  // so the name index maps to a LIST. Drafting them takes every row.
  const byName = new Map();
  for (const p of players) {
    if (!byName.has(p.norm)) byName.set(p.norm, []);
    byName.get(p.norm).push(p);
  }

  // Last-name index, used only to suggest a correction for an unmatched pick.
  const byLastName = new Map();
  for (const p of players) {
    const last = p.norm.split(" ").slice(-1)[0];
    if (!last) continue;
    if (!byLastName.has(last)) byLastName.set(last, []);
    byLastName.get(last).push(p);
  }

  return { players, byName, byLastName };
}

/**
 * Resolve a hand-typed sheet entry to player rows.
 * Returns { matched: [...], suggestion } — suggestion is only populated when
 * nothing matched, to help James fix a typo in the sheet fast.
 */
export function resolvePick(pool, text) {
  const norm = normalizeName(text);
  if (!norm) return { matched: [], suggestion: null };

  const exact = pool.byName.get(norm);
  if (exact) return { matched: exact, suggestion: null };

  // Fall back to last name, but only when it's unambiguous — guessing between
  // two players with the same surname is worse than saying "I don't know".
  const last = norm.split(" ").slice(-1)[0];
  const candidates = pool.byLastName.get(last) || [];
  const distinct = [...new Set(candidates.map((p) => p.norm))];
  if (distinct.length === 1) {
    return { matched: candidates, suggestion: candidates[0].name, fuzzy: true };
  }

  if (candidates.length) {
    return { matched: [], suggestion: candidates.map((p) => p.name).join(" / ") };
  }

  // Nothing matched on name or surname — most likely a misspelling. Offer the
  // closest name in the pool purely as a hint for fixing the sheet. This never
  // marks anyone taken: a wrong guess here would be exactly the silent failure
  // this whole path exists to prevent.
  return { matched: [], suggestion: nearest(pool, norm) };
}

/** Levenshtein, bailing out as soon as the distance exceeds `max`. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

function nearest(pool, norm) {
  const max = norm.length <= 8 ? 2 : 3;
  let best = null;
  let bestD = max + 1;
  for (const p of pool.players) {
    const d = distance(norm, p.norm, max);
    if (d < bestD) {
      bestD = d;
      best = p;
      if (d === 1) break;
    }
  }
  return best ? `${best.name}?` : null;
}
