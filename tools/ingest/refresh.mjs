#!/usr/bin/env node
import { writeFileSync, renameSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, ROOT, loadIngestConfig, stamp } from "./config.mjs";
import { merge } from "./merge.mjs";
import { validate } from "./validate.mjs";
import * as ffb from "./ffb.mjs";
import * as fantasypros from "./fantasypros.mjs";

/** League size drives the ADP round.pick conversion, so it comes from league.json. */
function readLeague() {
  try {
    return JSON.parse(readFileSync(join(DATA, "league.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * The yearly (or weekly) rankings refresh. This is the script extract_from_xlsx.py
 * has been pointing at since the migration.
 *
 *   node tools/ingest/refresh.mjs [--dry-run] [--season=2026] [--source=fantasypros,ffb]
 *
 * Pulls every configured source, merges them, validates the result, and only
 * then replaces data/players.<season>.json. Raw pulls are kept under
 * data/raw/<MM_DD_YY>/ so any run can be diffed or eyeballed after the fact.
 */

/**
 * Source order is priority order -- merge.mjs lets the first source to supply a
 * field keep it. FantasyPros goes first because it is the base list: it names
 * and ranks everyone including IDP, and its raw name is what forms each row's
 * id, which is the format extract_from_xlsx.py established and the 2025 file
 * still uses. The Fantasy Footballers then fill in the ffb_* columns.
 */
const SOURCES = { fantasypros, ffb };
const DEFAULT_SOURCES = ["fantasypros", "ffb"];

/**
 * Two sources rank the same positions, so their per-position counts collide.
 * Summing would double-count every quarterback; last-write-wins would check one
 * source's floor against the other's count. Keep the highest, which asserts
 * what we actually mean: at least one source returned a full table for this
 * position. Same for the floors themselves -- the strictest one applies.
 */
function mergeExpectations(entries) {
  const byPos = new Map();
  for (const { pos, min } of entries) {
    byPos.set(pos, Math.max(byPos.get(pos) ?? 0, min ?? 0));
  }
  return [...byPos].map(([pos, min]) => ({ pos, min }));
}

export async function refresh({ season, sources = DEFAULT_SOURCES, dryRun = false, log = console.log } = {}) {
  const cfg = await loadIngestConfig();
  season = season ?? cfg.season;
  cfg.league = readLeague();

  const outDir = join(DATA, "raw", stamp());
  const result = { season, dryRun, counts: {}, problems: [], warnings: [], rawDir: outDir };

  const pulled = [];
  const expected = [];

  for (const name of sources) {
    const source = SOURCES[name];
    if (!source) throw new Error(`unknown source "${name}" (have: ${Object.keys(SOURCES).join(", ")})`);
    log(`\n${name}: pulling ${season} rankings`);
    const out = await source.pull({
      season,
      credentials: cfg[name] ?? {},
      league: cfg.league,
      outDir,
      log,
    });
    pulled.push(out.rows);
    for (const [pos, n] of Object.entries(out.counts ?? {})) {
      result.counts[pos] = Math.max(result.counts[pos] ?? 0, n);
    }
    result.problems.push(...(out.problems ?? []));
    expected.push(...(out.positions ?? []));
    if (out.meta) result.meta = { ...(result.meta ?? {}), [name]: out.meta };
  }

  const collisions = [];
  const players = merge(pulled, { warn: (m) => collisions.push(m) });
  result.total = players.length;

  const target = join(DATA, `players.${season}.json`);
  const check = validate({
    players,
    counts: result.counts,
    expected: mergeExpectations(expected),
    previousFile: target,
  });

  // A partial refresh must not quietly delete another source's work.
  // Running only --source=ffb over a file that also holds FantasyPros columns
  // would replace it with FFB-only rows, and the loss would be invisible until
  // draft day. Refuse instead, and say what to run.
  for (const [field, owner, flag] of [
    ["pros_rank", "FantasyPros", "fantasypros"],
    ["ffb_pos_rank", "Fantasy Footballers", "ffb"],
  ]) {
    if (!existsSync(target)) continue;
    let had = 0;
    try {
      had = JSON.parse(readFileSync(target, "utf8")).filter((p) => p?.[field] != null).length;
    } catch {
      continue;
    }
    const have = players.filter((p) => p[field] != null).length;
    if (had > 0 && have === 0) {
      check.errors.push(
        `${target} currently holds ${owner} data for ${had} players, and this run pulled none. ` +
          `Writing would delete it. Refresh every source together, or add ${flag} to --source=.`
      );
      check.ok = false;
    }
  }
  result.ok = check.ok && result.problems.length === 0;
  result.errors = [...result.problems, ...check.errors];
  result.warnings = [...collisions, ...check.warnings];

  log(`\nmerged ${players.length} players across ${new Set(players.map((p) => p.pos)).size} positions`);
  for (const w of result.warnings) log(`  note: ${w}`);

  if (!result.ok) {
    log(`\nREFUSING TO WRITE — ${result.errors.length} problem(s):`);
    for (const e of result.errors) log(`  - ${e}`);
    log(`\n${existsSync(target) ? `${target} is untouched.` : "Nothing was written."}`);
    log(`Raw pull kept at ${outDir} so you can see what came back.`);
    return result;
  }

  if (dryRun) {
    log(`\ndry run — validated clean, wrote nothing. Raw pull at ${outDir}`);
    return result;
  }

  // Temp-file + rename, the same way lib/store.js writes, so an interrupted
  // save can never leave a half-written player pool behind.
  mkdirSync(DATA, { recursive: true });
  if (existsSync(target)) writeFileSync(`${target}.bak`, readFileSync(target));
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(players, null, 2));
  renameSync(tmp, target);

  log(`\nwrote ${target} (${players.length} players)`);
  log(`raw pull kept at ${outDir}`);
  result.written = target;
  return result;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  try {
    const out = await refresh({
      season: flag("season") ? Number(flag("season")) : undefined,
      sources: flag("source")?.split(",") ?? DEFAULT_SOURCES,
      dryRun: args.includes("--dry-run"),
    });
    process.exit(out.ok ? 0 : 1);
  } catch (err) {
    console.error(`\nrefresh failed: ${err.message}`);
    process.exit(1);
  }
}
