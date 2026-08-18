import { existsSync, readFileSync } from "node:fs";

/**
 * The gate between a pull and the file the app reads.
 *
 * CLAUDE.md rule 1 is "never let a pick fail silently". The same principle
 * applies upstream: a refresh that half-works and quietly overwrites the player
 * pool is the expensive failure here. A half-empty pool on draft morning shows
 * drafted players as available, which is precisely the outcome rule 1 exists to
 * prevent. So nothing is written unless every check below passes, and a failure
 * says which check and why.
 */

export function validate({ players, counts = {}, expected = [], previousFile, minTotal = 100 }) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(players) || players.length === 0) {
    return { ok: false, errors: ["no players parsed at all"], warnings };
  }

  // 1. Every position we asked for came back, and cleared its floor.
  for (const { pos, min } of expected) {
    const n = counts[pos] ?? 0;
    if (n === 0) errors.push(`${pos}: returned no players`);
    else if (n < min) errors.push(`${pos}: only ${n} players, expected at least ${min}`);
  }

  // 2. The total is in the same league as what it replaces. A source that
  //    truncates its table is the failure this catches.
  if (players.length < minTotal) {
    errors.push(`only ${players.length} players total, expected at least ${minTotal}`);
  }
  if (previousFile && existsSync(previousFile)) {
    try {
      const prev = JSON.parse(readFileSync(previousFile, "utf8"));
      if (Array.isArray(prev) && prev.length > 20) {
        const delta = (players.length - prev.length) / prev.length;
        if (delta < -0.25) {
          errors.push(
            `${players.length} players is ${Math.round(-delta * 100)}% fewer than the ${prev.length} being replaced`
          );
        } else if (Math.abs(delta) > 0.25) {
          warnings.push(`player count moved ${delta > 0 ? "+" : ""}${Math.round(delta * 100)}% (${prev.length} -> ${players.length})`);
        }
      }
    } catch {
      warnings.push("could not read the previous players file to compare counts");
    }
  }

  // 3. No duplicate ids. Two rows with the same id would let one be marked
  //    taken while the other stays available.
  const seen = new Map();
  for (const p of players) {
    seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1);
  if (dupes.length) {
    errors.push(`duplicate ids: ${dupes.slice(0, 5).map(([id, n]) => `${id} x${n}`).join(", ")}${dupes.length > 5 ? ` (+${dupes.length - 5} more)` : ""}`);
  }

  // 4. Fields are the right type where the app does arithmetic on them.
  const numeric = ["ffb_tier", "ffb_risk", "ffb_adp", "ffb_pos_rank", "ffb_upside", "pros_rank", "pros_tier"];
  for (const p of players) {
    for (const f of numeric) {
      const v = p[f];
      if (v != null && typeof v !== "number") {
        errors.push(`${p.name} (${p.pos}): ${f} is ${typeof v} "${v}", expected a number`);
        break;
      }
    }
    if (errors.length > 12) break;
  }
  if (!players.every((p) => p.name && p.pos && p.id)) {
    errors.push("some rows are missing name, pos, or id");
  }

  // 5. Sanity anchors: the top of each position should look like real players.
  for (const { pos } of expected) {
    const top = players.filter((p) => p.pos === pos).sort((a, b) => (a.ffb_pos_rank ?? 999) - (b.ffb_pos_rank ?? 999))[0];
    if (!top) continue;
    if (!/^[A-Za-z][A-Za-z.'\- ]{2,}/.test(top.name)) {
      errors.push(`${pos}: top-ranked entry "${top.name}" does not look like a player name`);
    }
  }

  // Not fatal, but worth saying out loud, because it changes what James can do
  // with the result: the UDK has no IDP, so an FFB-only pull cannot fill LB/DE/S.
  const idp = players.filter((p) => ["LB", "DE", "S", "DT", "CB"].includes(p.pos)).length;
  if (idp === 0) warnings.push("no IDP players (LB/DE/S/DT/CB) — the UDK does not rank them; these must come from the second source");

  return { ok: errors.length === 0, errors, warnings };
}
