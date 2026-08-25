import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { boardFile } from "./picks.js";

/**
 * Reads the board — the grid of typed player names this app writes and owns.
 *
 * The board is deliberately dumb: row 0 is team names, column 0 is round
 * numbers, and every other cell is just a typed player name. No formulas,
 * nothing to recalculate. All the logic that used to live in a spreadsheet now
 * lives in this app, which is what makes the 1-3 second target achievable.
 *
 * Two sources:
 *   'live'  — data/board.<season>.json, written by the pick box. The default,
 *             and the real draft record.
 *   'local' — data/board.local.json, the 2025 draft kept as a replay fixture.
 *             Read-only; `localLimit` replays it partway.
 *
 * Team names come from data/league.json, never from the grid's own row 0. Row 0
 * is written so the file reads sensibly on its own, but the app has exactly one
 * owner for who is drafting where — league.json — because item 6 lets that be
 * edited on screen and two sources for it would drift.
 */

function gridToPicks(rows, league) {
  const teams = league.teams.map((t, i) => String(t || `Team ${i + 1}`).trim());

  const picks = [];
  for (let r = 1; r <= league.rounds; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < teams.length; c++) {
      const text = (row[c + 1] || "").trim();
      if (!text) continue;
      picks.push({
        round: r,
        teamIndex: c,
        team: teams[c],
        text,
        // Snake order: odd rounds run left-to-right, even rounds right-to-left.
        slot: r % 2 === 1 ? c + 1 : teams.length - c,
      });
    }
  }

  // Sort into true draft order so "what just went" and round.pick labels are right.
  picks.sort((a, b) => a.round - b.round || a.slot - b.slot);
  picks.forEach((p) => {
    p.overall = (p.round - 1) * teams.length + p.slot;
    p.label = `${p.round}.${String(p.slot).padStart(2, "0")}`;
  });

  return { teams, picks };
}

function readFile(dataDir, league, limit, filename) {
  const file = join(dataDir, filename);
  if (!existsSync(file)) return gridToPicks([], league);
  const board = gridToPicks(JSON.parse(readFileSync(file, "utf8")), league);
  // localLimit replays the fixture partway, so a mid-draft state can be tested
  // without hand-editing the board file.
  if (typeof limit === "number" && limit >= 0) {
    board.picks = board.picks.slice(0, limit);
  }
  return board;
}

export async function readBoard(config, league, dataDir) {
  // The live board is never truncated by localLimit — that flag replays the
  // 2025 fixture partway, and a live board has no history to replay into.
  if (config.source === "local") {
    return readFile(dataDir, league, config.localLimit, "board.local.json");
  }
  return readFile(dataDir, league, undefined, boardFile(config.season));
}
