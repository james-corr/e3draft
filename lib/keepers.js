import { readFileSync, existsSync } from "node:fs";
import { normalizeName } from "./players.js";

/**
 * Reads the hand-edited keepers table (KEEPERS26.md: a markdown table with
 * Manager | Player | Round columns) that the LOAD KEEPERS button reloads onto
 * the board. Not season-suffixed like the other data files — it's meant to be
 * edited by hand once a year, not regenerated.
 */
export function parseKeepersFile(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || !t.endsWith("|")) continue;
    const cells = t
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^:?-+:?$/.test(cells[0])) continue; // the |---|---|---| separator row
    if (/^manager$/i.test(cells[0])) continue; // header row
    const round = Number(cells[2]);
    if (!cells[0] || !cells[1] || !Number.isInteger(round) || round < 1) continue;
    rows.push({ manager: cells[0], player: cells[1], round });
  }
  return rows;
}

/**
 * Matches each row's manager against the league's teams, normalized the same
 * way player names are — case, an apostrophe, spacing shouldn't matter, but
 * two different words must never collapse onto the same team (same reasoning
 * as house rule 1's refusal to guess between two players with one surname).
 * `teamIndex: -1` means nobody matched; the caller reports that rather than
 * guessing which team was meant.
 */
export function matchKeeperTeams(rows, teams) {
  const byNorm = new Map(teams.map((t, i) => [normalizeName(t), i]));
  return rows.map((r) => ({ ...r, teamIndex: byNorm.get(normalizeName(r.manager)) ?? -1 }));
}
