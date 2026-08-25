import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * The board itself — every pick James types, written to disk.
 *
 * This used to be a rehearsal stand-in for a shared Google Sheet that the
 * leaguemates co-edited. There is no shared sheet any more: James types every
 * pick into this app, so this file IS the draft record and there is no second
 * source of truth to reconcile against.
 *
 * The grid shape is kept: row 0 is team names, column 0 is the round number,
 * every other cell is a typed player name. It survives because it is dumb and
 * it diffs well, not because Google wanted it that way. `gridToPicks` in
 * board.js parses it, and team names come from league.json rather than row 0 —
 * that row is written here only so the file reads sensibly on its own.
 *
 * It writes data/board.<season>.json, NOT data/board.local.json. The local file
 * is the complete 2025 draft kept as a test fixture, and a live board that
 * overwrote it would destroy the only replay we have.
 */

export const boardFile = (season) => `board.${season}.json`;

function writeJson(path, value) {
  // Same temp-then-rename as lib/store.js. An interrupted write mid-draft should
  // cost the last pick, never the whole board.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, path);
}

const pathOf = (dataDir, season) => join(dataDir, boardFile(season));

/** An empty board: header row plus one row per round, all cells blank. */
export function emptyGrid(league) {
  const header = ["ROUND", ...league.teams];
  const rows = [];
  for (let r = 1; r <= league.rounds; r++) {
    rows.push([r, ...league.teams.map(() => "")]);
  }
  return [header, ...rows];
}

export function loadGrid(dataDir, league, season) {
  const file = pathOf(dataDir, season);
  if (!existsSync(file)) return emptyGrid(league);
  try {
    const grid = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) return emptyGrid(league);
    return grid;
  } catch {
    // A corrupt board file is not worth failing over — it holds nothing that
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
 * Deliberately does NOT refuse an unmatched name. A name the matcher can't
 * place must show up as an unmatched pick on screen (rule 1) rather than get
 * rejected at the door — silently refusing a pick is how a drafted player stays
 * on the board. The resolution result is returned so the entry box can say what
 * happened.
 */
export function addPick(dataDir, league, season, name, resolve) {
  const text = String(name ?? "").trim();
  if (!text) throw new Error("type a player name");

  const grid = loadGrid(dataDir, league, season);
  const at = nextOpen(grid, league);
  if (!at) throw new Error(`the board is full — all ${league.rounds} rounds are in`);

  const { matched, suggestion } = resolve(text);
  grid[at.round][at.teamIndex + 1] = text;
  writeJson(pathOf(dataDir, season), grid);

  return {
    at,
    text,
    matched: matched.map((m) => ({ name: m.name, pos: m.pos, team: m.team })),
    suggestion: suggestion ?? null,
  };
}

/**
 * Write one named cell, wherever it sits in the draft.
 *
 * The sibling of addPick: same write, same refusal to reject an unmatched name,
 * but aimed at a cell James picked rather than at whatever is next on the clock.
 * That is what makes keepers possible without a keeper mechanism — Bob keeping
 * Drake Maye in round 10 is just Bob's round-10 cell, typed early. It is also
 * how a pick typed into the wrong column gets fixed mid-draft.
 *
 * A blank name clears the cell. `nextOpen` then hands that slot back out, which
 * is exactly right: clearing a pick means it never happened.
 */
export function setCell(dataDir, league, season, round, teamIndex, name, resolve) {
  const teamCount = league.teams.length;
  if (!Number.isInteger(round) || round < 1 || round > league.rounds) {
    throw new Error(`round ${round} is outside 1-${league.rounds}`);
  }
  if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= teamCount) {
    throw new Error(`there is no column ${teamIndex}`);
  }

  const text = String(name ?? "").trim();
  const grid = loadGrid(dataDir, league, season);
  const before = String(grid[round]?.[teamIndex + 1] ?? "").trim();

  const at = {
    round,
    teamIndex,
    slot: round % 2 === 1 ? teamIndex + 1 : teamCount - teamIndex,
    team: league.teams[teamIndex],
  };
  at.overall = (round - 1) * teamCount + at.slot;
  at.label = `${round}.${String(at.slot).padStart(2, "0")}`;

  grid[round][teamIndex + 1] = text;
  writeJson(pathOf(dataDir, season), grid);

  const { matched, suggestion } = text ? resolve(text) : { matched: [], suggestion: null };
  return {
    at,
    text,
    before,
    cleared: !text,
    matched: matched.map((m) => ({ name: m.name, pos: m.pos, team: m.team })),
    suggestion: suggestion ?? null,
  };
}

export function undoPick(dataDir, league, season) {
  const grid = loadGrid(dataDir, league, season);
  const last = lastFilled(grid, league);
  if (!last) throw new Error("no picks to undo");
  grid[last.round][last.teamIndex + 1] = "";
  writeJson(pathOf(dataDir, season), grid);
  return last;
}

/**
 * Wipe the board, keeping the cells listed in `keep`.
 *
 * CLEAR BOARD is how a mock draft is run now, and keepers are not part of the
 * rehearsal — they are settled facts that were true before the draft started.
 * Passing the keeper cells through means a mock resets to the real starting
 * position rather than to an empty grid.
 */
export function resetBoard(dataDir, league, season, keep = []) {
  const teamCount = league.teams.length;
  const grid = loadGrid(dataDir, league, season);
  const next = emptyGrid(league);
  next[0] = grid[0] ? [...grid[0]] : next[0];
  for (const { round, teamIndex } of keep) {
    if (!Number.isInteger(round) || round < 1 || round > league.rounds) continue;
    if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= teamCount) continue;
    next[round][teamIndex + 1] = String(grid[round]?.[teamIndex + 1] ?? "");
  }
  writeJson(pathOf(dataDir, season), next);
}

/**
 * Rewrite the board for a new set of team names and/or a new team order,
 * carrying each team's picks with them.
 *
 * `order` is the new arrangement given as old-index-per-new-slot: `order[0] = 3`
 * means the team that was in column 3 is now the first column. Picks travel with
 * their owner, so a manager moved from 4th to 1st keeps everyone they already
 * took — what changes is where their picks fall in the snake, which is the
 * entire reason to reorder. A pure rename passes the identity order and only
 * row 0 changes.
 *
 * Team names on screen come from league.json; row 0 is written here so the file
 * still reads sensibly on its own.
 */
export function applyTeams(dataDir, league, season, names, order = names.map((_, i) => i)) {
  const grid = loadGrid(dataDir, league, season);
  const next = grid.map((row) => [row[0], ...order.map((from) => row[from + 1] ?? "")]);
  next[0] = ["ROUND", ...names];
  writeJson(pathOf(dataDir, season), next);
  return next;
}
