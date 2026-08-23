import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * The mock board — a local stand-in for the shared Google Sheet, so a mock
 * draft can be run with no API key and no internet.
 *
 * It writes the SAME grid shape the sheet returns: row 0 is team names, column
 * 0 is the round number, every other cell is a typed player name. That is the
 * point. `gridToPicks` in board.js parses it without knowing the difference, so
 * a mock exercises the real engine, the real matcher and the real board render
 * — everything except the network hop to Google.
 *
 * It writes data/board.mock.json, NOT data/board.local.json. The local file is
 * the complete 2025 draft kept as a test fixture, and a mock that overwrote it
 * would destroy the only replay we have.
 *
 * WHY THERE IS NO WRITE PATH TO THE SHEET. The app reads Google with an API
 * key, which is read-only by design (writing needs a full OAuth flow and a
 * consent screen). That limit is worth keeping rather than working around:
 * CLAUDE.md rule 2 says the sheet stays dumb and the app stays a reader, and on
 * draft day the leaguemates' typing is the source of truth. So the pick box is
 * mock-only, and it is hidden when the app is pointed at the sheet.
 */

export const MOCK_FILE = "board.mock.json";

function writeJson(path, value) {
  // Same temp-then-rename as lib/store.js. An interrupted write mid-mock should
  // cost the last pick, never the whole board.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, path);
}

const pathOf = (dataDir) => join(dataDir, MOCK_FILE);

/** An empty board: header row plus one row per round, all cells blank. */
export function emptyGrid(league) {
  const header = ["ROUND", ...league.teams];
  const rows = [];
  for (let r = 1; r <= league.rounds; r++) {
    rows.push([r, ...league.teams.map(() => "")]);
  }
  return [header, ...rows];
}

export function loadGrid(dataDir, league) {
  const file = pathOf(dataDir);
  if (!existsSync(file)) return emptyGrid(league);
  try {
    const grid = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) return emptyGrid(league);
    return grid;
  } catch {
    // A corrupt mock board is not worth failing over — it holds nothing that
    // can't be re-typed. Start clean rather than refusing to boot.
    return emptyGrid(league);
  }
}

/**
 * Which grid cell holds a given overall pick number.
 *
 * The inverse of the snake in gridToPicks: odd rounds run left-to-right, so
 * slot n is column n; even rounds run right-to-left, so slot n is the nth
 * column from the end. Getting this backwards would put every even-round pick
 * on the wrong team, which is why it is one function with one test rather than
 * arithmetic inlined at each call site.
 */
export function cellFor(overall, teamCount) {
  const round = Math.floor((overall - 1) / teamCount) + 1;
  const slot = ((overall - 1) % teamCount) + 1;
  const teamIndex = round % 2 === 1 ? slot - 1 : teamCount - slot;
  return { round, slot, teamIndex, label: `${round}.${String(slot).padStart(2, "0")}` };
}

/** The next unfilled cell in true draft order, or null when the board is full. */
export function nextOpen(grid, league) {
  const teamCount = league.teams.length;
  for (let overall = 1; overall <= league.rounds * teamCount; overall++) {
    const at = cellFor(overall, teamCount);
    const row = grid[at.round] || [];
    if (!String(row[at.teamIndex + 1] ?? "").trim()) {
      return { ...at, overall, team: (grid[0] || [])[at.teamIndex + 1] || league.teams[at.teamIndex] };
    }
  }
  return null;
}

/** The last filled cell in draft order, or null when the board is empty. */
function lastFilled(grid, league) {
  const teamCount = league.teams.length;
  let found = null;
  for (let overall = 1; overall <= league.rounds * teamCount; overall++) {
    const at = cellFor(overall, teamCount);
    const text = String((grid[at.round] || [])[at.teamIndex + 1] ?? "").trim();
    if (text) found = { ...at, overall, text };
  }
  return found;
}

/**
 * Record a pick at the next open slot.
 *
 * Deliberately does NOT refuse an unmatched name. A leaguemate can type
 * anything into the real sheet, and the whole point of rehearsing is to see
 * what the board does with a name the matcher can't place — it must show up as
 * an unmatched pick on screen (rule 1), not get rejected at the door. The
 * resolution result is returned so the entry box can say what happened.
 */
export function addPick(dataDir, league, name, resolve) {
  const text = String(name ?? "").trim();
  if (!text) throw new Error("type a player name");

  const grid = loadGrid(dataDir, league);
  const at = nextOpen(grid, league);
  if (!at) throw new Error(`the board is full — all ${league.rounds} rounds are in`);

  const { matched, suggestion } = resolve(text);
  grid[at.round][at.teamIndex + 1] = text;
  writeJson(pathOf(dataDir), grid);

  return {
    at,
    text,
    matched: matched.map((m) => ({ name: m.name, pos: m.pos, team: m.team })),
    suggestion: suggestion ?? null,
  };
}

export function undoPick(dataDir, league) {
  const grid = loadGrid(dataDir, league);
  const last = lastFilled(grid, league);
  if (!last) throw new Error("no picks to undo");
  grid[last.round][last.teamIndex + 1] = "";
  writeJson(pathOf(dataDir), grid);
  return last;
}

export function resetBoard(dataDir, league) {
  writeJson(pathOf(dataDir), emptyGrid(league));
}
