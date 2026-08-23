import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MOCK_FILE } from "./mock.js";

/**
 * Reads the shared board — the one thing leaguemates touch during the draft.
 *
 * The new board tab is deliberately dumb: row 1 is team names, column A is round
 * numbers, and every other cell is just a typed player name. No formulas, no
 * hidden tabs, nothing to recalculate. All the logic that used to live in the
 * spreadsheet now lives in this app, which is what makes the 1-3 second target
 * achievable — reading 20x12 plain cells is fast and never needs a re-trigger
 * the way IMPORTRANGE did.
 *
 * Three sources:
 *   'sheet' — the live Google Sheet, read-only, via an API key.
 *   'local' — data/board.local.json, the 2025 draft kept as a replay fixture.
 *   'mock'  — data/board.mock.json, written by the in-app pick box. Same grid
 *             shape as the sheet, so a mock exercises the real matcher and the
 *             real engine with nothing stubbed but the network hop.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function gridToPicks(rows, league) {
  const teamsRow = rows[0] || [];
  // Trust the sheet's own header for team order — if James reorders columns in
  // the sheet, the app follows rather than silently mismapping picks to owners.
  const teams = [];
  for (let c = 1; c <= league.teams.length; c++) {
    teams.push((teamsRow[c] || "").trim() || league.teams[c - 1] || `Team ${c}`);
  }

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

async function readSheet(config, league) {
  const range = encodeURIComponent(
    `${config.tabName}!A1:${colLetter(league.teams.length + 1)}${league.rounds + 1}`
  );
  const url = `${SHEETS_API}/${config.sheetId}/values/${range}?key=${config.apiKey}&majorDimension=ROWS`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets returned ${res.status}. ${describeSheetError(res.status, body)}`);
  }
  const json = await res.json();
  return gridToPicks(json.values || [], league);
}

function readLocal(dataDir, league, limit, filename = "board.local.json") {
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

/** Plain-English causes, so a draft-day failure is diagnosable in seconds. */
function describeSheetError(status, body) {
  if (status === 403) {
    return "Usually means the sheet isn't shared as 'anyone with the link can view', or the API key is restricted from the Sheets API.";
  }
  if (status === 404) {
    return "Usually means the sheet ID is wrong, or the tab name in config.json doesn't match the actual tab.";
  }
  if (status === 429) return "Polling too fast for the API quota — raise pollMs in config.json.";
  return body.slice(0, 200);
}

export function colLetter(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function readBoard(config, league, dataDir) {
  if (config.source === "sheet") return readSheet(config, league);
  // The mock board is never truncated by localLimit -- that flag replays the
  // 2025 fixture partway, and a mock has no history to replay into.
  if (config.source === "mock") return readLocal(dataDir, league, undefined, MOCK_FILE);
  return readLocal(dataDir, league, config.localLimit);
}
