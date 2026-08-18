import { createServer } from "node:http";
import { readFile, readFileSync, existsSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { loadPlayers, resolvePick } from "./lib/players.js";
import { readBoard } from "./lib/board.js";
import { computeState } from "./lib/state.js";
import { createStore } from "./lib/store.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, "data");
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT) || 4173;
const SEASON = 2025;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULTS = { source: "local", pollMs: 1500, tabName: "DRAFT BOARD" };
const configPath = join(ROOT, "config.json");
const config = { ...DEFAULTS, ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}) };

if (config.source === "sheet" && (!config.sheetId || !config.apiKey)) {
  console.error("config.json says source:'sheet' but sheetId/apiKey are missing. Falling back to local board.");
  config.source = "local";
}

const league = JSON.parse(readFileSync(join(DATA, "league.json"), "utf8"));
const pool = loadPlayers(DATA, SEASON);
const store = createStore(DATA, SEASON);

// ---------------------------------------------------------------------------
// Poll loop: read the board, recompute, push to browsers only when it changed.
// ---------------------------------------------------------------------------
let current = null;
let lastBoard = null;
let lastHash = null;
let lastError = null;
let consecutiveErrors = 0;
const clients = new Set();

function hashBoard(board) {
  return createHash("sha1")
    .update(board.picks.map((p) => `${p.round}:${p.teamIndex}:${p.text}`).join("|"))
    .digest("hex");
}

async function tick() {
  try {
    const board = await readBoard(config, league, DATA);
    lastError = null;
    consecutiveErrors = 0;

    const hash = hashBoard(board);
    // Recompute only on change. Nothing to do 95% of the time during a draft.
    if (hash === lastHash && current) return;
    lastHash = hash;
    lastBoard = board;

    current = computeState({ pool, league, board, inventory: store.inventory, plan: store.plan });
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
  current = computeState({ pool, league, board: lastBoard, inventory: store.inventory, plan: store.plan });
  broadcast();
}

function payload() {
  return JSON.stringify({
    ok: !lastError,
    error: lastError,
    source: config.source,
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

  // --- the whole pool, for the plan editor's name field --------------------
  // Sent once when the editor opens, not per keystroke.
  if (path === "/api/players") {
    return sendJson(
      res,
      200,
      pool.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, team: p.team }))
    );
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
    console.log(`  board source : ${config.source === "sheet" ? `Google Sheet (${config.tabName})` : "data/board.local.json"}`);
    console.log(`  poll         : every ${config.pollMs}ms`);
    console.log(`  players      : ${pool.players.length}`);
    console.log(`  you          : ${league.myTeam}`);
    console.log("");
  });
}

boot();
