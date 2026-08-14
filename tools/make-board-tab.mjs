#!/usr/bin/env node
/**
 * Emits the new shared-board tab as a CSV, ready to import into the existing
 * "E3 Draft" Google Sheet as a new tab. Run:
 *
 *   node tools/make-board-tab.mjs
 *
 * The whole point of this tab is that it is dumb. No formulas, no hidden
 * sheets, no IMPORTRANGE — just team names across the top, round numbers down
 * the side, and one typed player name per cell. Everything the old workbook
 * computed in ~2,500 rows of spreadsheet formulas now happens in the app, which
 * is what makes the 1-3 second update target reachable and what stops a
 * leaguemate's stray cursor from breaking the engine mid-draft.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const league = JSON.parse(readFileSync(join(ROOT, "data", "league.json"), "utf8"));

/** Quote only when a field could otherwise break the CSV. */
const cell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [["ROUND", ...league.teams]];
for (let r = 1; r <= league.rounds; r++) {
  rows.push([r, ...league.teams.map(() => "")]);
}

const csv = rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

mkdirSync(join(ROOT, "out"), { recursive: true });
const outPath = join(ROOT, "out", "DRAFT BOARD.csv");
writeFileSync(outPath, csv);

console.log(`Wrote ${outPath}`);
console.log(`  ${league.teams.length} teams x ${league.rounds} rounds`);
console.log("");
console.log("To install it in the shared sheet:");
console.log("  1. Open the existing E3 Draft sheet.");
console.log("  2. File > Import > Upload, pick this CSV.");
console.log('  3. Import location: "Insert new sheet(s)".  Do NOT replace the spreadsheet.');
console.log('  4. Rename the new tab to exactly:  DRAFT BOARD');
console.log("  5. Freeze row 1 and column A (View > Freeze) so they stay put while scrolling.");
console.log("");
console.log("Then tell your leaguemates: type the player's name only. No position,");
console.log("no team, no bye week — the app fills all that in.");
