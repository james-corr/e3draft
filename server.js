import { createServer } from "node:http";
import { readFile, readFileSync, existsSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { loadPlayers, resolvePick } from "./lib/players.js";
import { readBoard } from "./lib/board.js";
import { computeState } from "./lib/state.js";
import { createStore } from "./lib/store.js";
import * as picks from "./lib/picks.js";
import { parseKeepersFile, matchKeeperTeams } from "./lib/keepers.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, "data");
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT) || 4173;
const KEEPERS_FILE = join(ROOT, "KEEPERS26.md");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULTS = { source: "live", pollMs: 1500, season: 2025 };
const configPath = join(ROOT, "config.json");
const config = { ...DEFAULTS, ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}) };

const SEASON = config.season;

// `let`, not `const`: a rankings refresh swaps the whole pool in place. See
// /api/refresh below — nothing else is allowed to reassign it.
let pool = loadPlayers(DATA, SEASON);
const store = createStore(DATA, SEASON);

// The board is read-only in replay mode: data/board.local.json is the 2025
// draft kept as a test fixture, and nothing may write over it.
const CAN_WRITE_PICKS = config.source !== "local";

// ---------------------------------------------------------------------------
// Poll loop: read the board, recompute, push to browsers only when it changed.
// ---------------------------------------------------------------------------
let current = null;
let lastBoard = null;
let lastHash = null;
let lastError = null;
let consecutiveErrors = 0;
const clients = new Set();
let refreshing = false;

function hashBoard(board) {
  return createHash("sha1")
    .update(board.picks.map((p) => `${p.round}:${p.teamIndex}:${p.text}`).join("|"))
    .digest("hex");
}

async function tick() {
  try {
    const board = await readBoard(config, store.league, DATA);
    lastError = null;
    consecutiveErrors = 0;

    const hash = hashBoard(board);
    // Recompute only on change. Nothing to do 95% of the time during a draft.
    if (hash === lastHash && current) return;
    lastHash = hash;
    lastBoard = board;

    current = computeState({ pool, league: store.league, board, inventory: store.inventory, plan: store.plan });
    broadcast();
  } catch (err) {
    consecutiveErrors++;
    lastError = err.message;
    // One blip during a draft is normal; a sustained outage is not.
    if (consecutiveErrors === 1 || consecutiveErrors % 20 === 0) {
      console.error(`[poll] ${err.message} (${consecutiveErrors} in a row)`);
    }
    broadcast();
  }
}

/** Recompute from the board we already have — for local edits like starring. */
function recomputeLocal() {
  if (!lastBoard) return;
  current = computeState({ pool, league: store.league, board: lastBoard, inventory: store.inventory, plan: store.plan });
  broadcast();
}

/**
 * Re-read players.<season>.json after a rankings refresh has replaced it.
 * The pool is otherwise loaded once at boot and never touched.
 */
function reloadPool() {
  pool = loadPlayers(DATA, SEASON);
  recomputeLocal();
  return pool.players.length;
}

/**
 * Has this name already been drafted, and by whom?
 *
 * Compared on the resolved player rather than the typed text, so "gibbs" typed
 * after "Jahmyr Gibbs" is caught. Returns null when he is still on the board.
 */
function whoAlreadyHas(name, ignore = null) {
  const { matched } = resolvePick(pool, name);
  if (!matched.length || !current) return null;
  const norms = new Set(matched.map((m) => m.norm));
  // `ignore` is the cell being rewritten. Without it, saving a cell without
  // changing its name would report the player as a duplicate of himself.
  const had = current.board.picks.find(
    (p) =>
      norms.has(p.player.norm) &&
      !(ignore && p.round === ignore.round && p.teamIndex === ignore.teamIndex)
  );
  return had ? { name: had.player.name, label: had.label, team: had.team } : null;
}

function payload() {
  return JSON.stringify({
    ok: !lastError,
    error: lastError,
    source: config.source,
    canEnterPicks: CAN_WRITE_PICKS,
    state: current,
  });
}

function broadcast() {
  const data = payload();
  for (const res of clients) {
    res.write(`data: ${data}\n\n`);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // --- live stream -------------------------------------------------------
  if (path === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`data: ${payload()}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (path === "/api/state") {
    return sendJson(res, 200, JSON.parse(payload()));
  }

  // --- inventory: star / tag / note a player -----------------------------
  if (path.startsWith("/api/player/") && req.method === "POST") {
    const id = decodeURIComponent(path.slice("/api/player/".length));
    if (!pool.players.some((p) => p.id === id)) {
      return sendJson(res, 404, { error: `unknown player id: ${id}` });
    }
    try {
      const patch = await readBody(req);
      const entry = store.updatePlayer(id, patch);
      recomputeLocal();
      return sendJson(res, 200, { ok: true, entry });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- refresh the rankings from the source sites --------------------------
  // Pre-draft maintenance, deliberately not reachable from the draft-day rail.
  if (path === "/api/refresh" && req.method === "POST") {
    if (refreshing) return sendJson(res, 409, { error: "a refresh is already running" });

    // Swapping the player pool mid-draft would re-key every player while picks
    // are landing. There is no reason to ever want that, so it is simply not
    // allowed once the board has picks on it.
    if (current?.board?.madePicks > 0) {
      return sendJson(res, 409, {
        error: `The board already has ${current.board.madePicks} picks. Refresh the rankings before the draft, not during it.`,
      });
    }

    refreshing = true;
    try {
      const body = await readBody(req).catch(() => ({}));
      const { refresh } = await import("./tools/ingest/refresh.mjs");
      const lines = [];
      // A refresh pulls THIS year's rankings, which is not necessarily the
      // season the app is displaying — during a migration the new pool lands on
      // disk before the app is switched over to it.
      const pullSeason = Number(body.season) || new Date().getFullYear();
      const out = await refresh({
        season: pullSeason,
        sources: Array.isArray(body.sources) ? body.sources : ["ffb"],
        log: (line) => {
          lines.push(String(line));
          console.log(line);
        },
      });
      // Only swap the live pool if what we just wrote is the file this app
      // reads. Otherwise say so, rather than implying a reload that didn't
      // happen — a refresh that looks applied but isn't would be the worst
      // outcome here.
      if (out.ok && out.written) {
        if (pullSeason === SEASON) out.players = reloadPool();
        else out.warnings = [
          ...(out.warnings ?? []),
          `wrote the ${pullSeason} pool, but this app is showing ${SEASON} — set "season": ${pullSeason} in config.json to use it`,
        ];
      }
      return sendJson(res, out.ok ? 200 : 422, { ...out, log: lines });
    } catch (err) {
      console.error(`[refresh] ${err.message}`);
      return sendJson(res, 500, { ok: false, errors: [err.message] });
    } finally {
      refreshing = false;
    }
  }

  // --- the whole pool, for the plan editor's name field --------------------
  // Sent once when the editor opens, not per keystroke.
  if (path === "/api/players") {
    return sendJson(
      res,
      200,
      // ffb_adp and pros_rank ride along so the type-ahead can order candidates
      // by draft value rather than by how the letters happened to line up.
      pool.players.map((p) => ({
        id: p.id,
        name: p.name,
        pos: p.pos,
        team: p.team,
        ffb_adp: p.ffb_adp ?? null,
        pros_rank: p.pros_rank ?? null,
      }))
    );
  }

  // --- the board: every pick James types ----------------------------------
  // Refused in replay mode, where data/board.local.json is the 2025 draft kept
  // as a fixture. Refusing on the server rather than only hiding the control is
  // the part that matters — hiding a button is not a guarantee.
  if (path.startsWith("/api/board/") && req.method === "POST") {
    if (!CAN_WRITE_PICKS) {
      return sendJson(res, 409, {
        error: `config.json has source:"${config.source}" — that board is a read-only replay fixture.`,
      });
    }
    const action = path.slice("/api/board/".length);
    const league = store.league;
    const upNext = () => picks.nextOpen(picks.loadGrid(DATA, league, SEASON), league);
    try {
      if (action === "pick") {
        const { name } = await readBody(req);
        // Where this player already went, if he did. Recorded, never refused —
        // rule 1 is that a pick must never fail silently, and a duplicate is
        // reported for the same reason: a burned slot and a player James still
        // thinks is available is the expensive failure, not the second entry.
        const already = whoAlreadyHas(name);
        const out = picks.addPick(DATA, league, SEASON, name, (text) => resolvePick(pool, text));
        await tick();
        return sendJson(res, 200, { ok: true, ...out, already, next: upNext() });
      }
      // One named cell, wherever it sits — the click-into-any-pick path. This is
      // how keepers get onto the board: Bob keeping Drake Maye in round 10 is
      // just Bob's round-10 cell, typed before the draft starts. It is also how
      // a typo or a pick entered in the wrong column gets fixed mid-draft.
      if (action === "cell") {
        const body = await readBody(req);
        const round = Number(body.round);
        const teamIndex = Number(body.teamIndex);

        // Validated BEFORE anything is written: this action touches two files
        // and a request that ends in an error must not have left the first one
        // changed. Same reasoning as /api/league below.
        if (!Number.isInteger(round) || round < 1 || round > league.rounds) {
          throw new Error(`round ${body.round} is outside 1-${league.rounds}`);
        }
        if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= league.teams.length) {
          throw new Error(`there is no column ${body.teamIndex}`);
        }

        const already = body.name ? whoAlreadyHas(body.name, { round, teamIndex }) : null;
        const out = picks.setCell(DATA, league, SEASON, round, teamIndex, body.name, (text) =>
          resolvePick(pool, text)
        );

        // The marker is coordinates only; the name lives in the grid. Clearing
        // a cell drops its marker with it — an empty cell is nobody's keeper.
        const wanted = out.cleared ? false : Boolean(body.keeper);
        const had = league.keepers.some((k) => k.round === round && k.teamIndex === teamIndex);
        if (wanted !== had) {
          store.saveKeepers(
            wanted
              ? [...league.keepers, { round, teamIndex }]
              : league.keepers.filter((k) => !(k.round === round && k.teamIndex === teamIndex))
          );
        }

        // A cleared-then-refilled cell can hash the same as before. Force it.
        lastHash = null;
        await tick();
        return sendJson(res, 200, { ok: true, ...out, keeper: wanted, already, next: upNext() });
      }
      // Bulk keeper entry from KEEPERS26.md, for after a mock-draft CLEAR BOARD.
      // Only writes the cells the file names — a keeper set some other way and
      // not in the file is left exactly as it is, never dropped.
      if (action === "load-keepers") {
        const rows = matchKeeperTeams(parseKeepersFile(KEEPERS_FILE), league.teams);
        const matched = rows.filter((r) => r.teamIndex >= 0);
        const unmatched = rows.filter((r) => r.teamIndex < 0);

        const loaded = matched.map((r) => ({
          ...r,
          ...picks.setCell(DATA, league, SEASON, r.round, r.teamIndex, r.player, (text) =>
            resolvePick(pool, text)
          ),
        }));

        const additions = matched
          .filter((r) => !league.keepers.some((k) => k.round === r.round && k.teamIndex === r.teamIndex))
          .map((r) => ({ round: r.round, teamIndex: r.teamIndex }));
        if (additions.length) store.saveKeepers([...league.keepers, ...additions]);

        lastHash = null;
        await tick();
        return sendJson(res, 200, {
          ok: true,
          loaded: loaded.map((r) => ({ manager: r.manager, player: r.player, round: r.round, team: r.at.team })),
          unmatched: unmatched.map((r) => r.manager),
          next: upNext(),
        });
      }
      if (action === "undo") {
        const removed = picks.undoPick(DATA, league, SEASON);
        await tick();
        return sendJson(res, 200, { ok: true, removed, next: upNext() });
      }
      if (action === "reset") {
        // CLEAR BOARD wipes keepers too — LOAD KEEPERS (from KEEPERS26.md) is
        // the only path back onto the board now, so there's nothing left for a
        // clear to preserve.
        const hadKeepers = league.keepers.length > 0;
        picks.resetBoard(DATA, league, SEASON);
        if (hadKeepers) store.saveKeepers([]);
        lastHash = null;
        await tick();
        return sendJson(res, 200, { ok: true, next: upNext() });
      }
      return sendJson(res, 404, { error: `unknown board action "${action}"` });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- who is drafting, in what order, and which one is me ----------------
  // Renaming is always safe. Reordering moves each team's picks with them, so
  // a manager keeps what they drafted and only their place in the snake moves.
  if (path === "/api/league" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const before = store.league.teams;

      // `order` is old-index-per-new-slot. Checked BEFORE anything is written:
      // this endpoint touches two files, and a request that ends in an error
      // must not have left the first one changed.
      const order = Array.isArray(body.order) ? body.order : null;
      if (order) {
        if (order.some((i) => !Number.isInteger(i) || i < 0 || i >= before.length)) {
          throw new Error("order refers to a column that doesn't exist");
        }
        // A permutation, not just numbers in range: a duplicated index would
        // copy one team's picks into two columns and lose another's entirely.
        if (order.length !== before.length || new Set(order).size !== before.length) {
          throw new Error("order must list every column exactly once");
        }
      }

      const saved = store.saveLeague(body);
      // In replay mode the board file is left alone — the 2025 fixture is not
      // ours to rewrite.
      if (CAN_WRITE_PICKS) {
        picks.applyTeams(DATA, store.league, SEASON, saved.teams, order ?? undefined);
      }

      lastHash = null; // the grid moved under us; force a recompute
      await tick();
      return sendJson(res, 200, { ok: true, league: { teams: saved.teams, myTeam: saved.myTeam } });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- does this typed name land on a real player? -------------------------
  // The editor asks the server rather than matching names itself, so a plan
  // target is judged by exactly the matcher that will read it on draft day.

  if (path === "/api/resolve" && req.method === "POST") {
    try {
      const { names } = await readBody(req);
      if (!Array.isArray(names)) throw new Error("names must be an array");
      return sendJson(res, 200, {
        results: names.map((raw) => {
          const name = String(raw ?? "");
          const { matched, suggestion } = resolvePick(pool, name);
          return {
            name,
            matched: matched.map((m) => ({ name: m.name, pos: m.pos, team: m.team })),
            suggestion: suggestion ?? null,
          };
        }),
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- contingency plans --------------------------------------------------
  // The raw plan, not the computed branches the stream carries: the editor
  // works on what is on disk.
  if (path === "/api/plan" && req.method === "GET") {
    return sendJson(res, 200, store.plan);
  }

  if (path === "/api/plan" && req.method === "POST") {
    try {
      const next = await readBody(req);
      const saved = store.savePlan(next);
      recomputeLocal();
      return sendJson(res, 200, { ok: true, plan: saved });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- static -------------------------------------------------------------
  let rel = path === "/" ? "/index.html" : path;
  const file = join(PUBLIC, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  await tick();
  setInterval(tick, config.pollMs);
  server.listen(PORT, () => {
    console.log("");
    console.log("  E3 Draft — command center");
    console.log(`  http://localhost:${PORT}`);
    console.log("");
    const sourceLabel = CAN_WRITE_PICKS
      ? `data/${picks.boardFile(SEASON)} — pick box on`
      : "data/board.local.json — 2025 replay, read-only";
    console.log(`  board        : ${sourceLabel}`);
    console.log(`  poll         : every ${config.pollMs}ms`);
    console.log(`  players      : ${pool.players.length}`);
    console.log(`  you          : ${store.league.myTeam}`);
    console.log("");
  });
}

boot();
