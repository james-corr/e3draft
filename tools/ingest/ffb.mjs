import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Session } from "./session.mjs";
import { loadEngine } from "./udk-engine.mjs";
import { ROOT } from "./config.mjs";

/**
 * Source adapter: Fantasy Footballers Ultimate Draft Kit position rankings.
 *
 * The UDK computes its rankings in the browser from projections, so there is
 * nothing to scrape -- see udk-engine.mjs for how we run their own maths
 * instead. This module's job is only to turn the result into the row shape
 * merge.mjs expects, and to write the raw pull to disk for later inspection.
 *
 * Exports pull(). A second source means another module with this one function.
 */

/**
 * What the UDK ranks, and what this app calls it.
 *
 * FLEX is deliberately absent: it is RB/WR/TE re-listed together, so pulling it
 * would duplicate every skill player under a position that isn't a real one.
 *
 * The UDK ranks no IDP at all -- no LB, DE, S, DT or CB. James's league starts
 * LB, DE and S, so this source can never fill his whole pool on its own. The
 * validator says so on every run rather than letting it be discovered late.
 */
export const POSITIONS = [
  { pos: "QB", min: 25, kind: "skill" },
  { pos: "RB", min: 60, kind: "skill" },
  { pos: "WR", min: 90, kind: "skill" },
  { pos: "TE", min: 35, kind: "skill" },
  { pos: "K", min: 20, kind: "consensus" },
  { pos: "DST", min: 20, kind: "consensus" },
];

const numOrNull = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Round to 2dp without turning 9.666666666666666 into a string. */
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/**
 * ADP as round.pick (1.02 = round 1, pick 2), matching the existing data files
 * and what public/util.js prints. Their formatADP produces the same string; we
 * keep a number so the app can sort on it.
 */
function adpRoundPick(adp, teams) {
  const n = numOrNull(adp);
  if (n == null) return null;
  const pick = (Math.round(n - 1) % teams) + 1;
  const round = Math.floor(Math.round(n - 1) / teams) + 1;
  return round + pick / 100;
}

/** A ranked skill-position row -> our shape. */
const skillRow = (r, pos, teams) => ({
  name: String(r.name || "").trim(),
  pos,
  team: r.team || null,
  bye: numOrNull(r.bye_week),
  ffb_pos_rank: numOrNull(r.rank),
  ffb_tier: numOrNull(r.tier),
  ffb_risk: round2(numOrNull(r.risk)),
  ffb_upside: round2(numOrNull(r.upside)),
  ffb_adp: adpRoundPick(r.adp, teams),
  source: "ffb",
});

/**
 * D/ST and K carry a consensus rank only -- no tier, risk, upside or ADP. That
 * matches the old workbook, where those two blocks were Name and Rank alone.
 */
const consensusRow = (r, pos) => ({
  name: String(r.name || "").trim(),
  pos,
  team: r.team || null,
  bye: numOrNull(r.bye_week),
  ffb_pos_rank: numOrNull(r.rank),
  ffb_tier: null,
  ffb_risk: null,
  ffb_upside: null,
  ffb_adp: null,
  source: "ffb",
});

function toCsv(rows) {
  const cols = [...rows.reduce((s, r) => (Object.keys(r).forEach((k) => s.add(k)), s), new Set())];
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

/**
 * Log in, run the UDK engine, and return { rows, counts, problems }.
 *
 * The whole footprint is one page load, one API call and one static asset --
 * lighter than opening the page in a browser, which is what it replaces.
 */
export async function pull({ season, credentials = {}, league = {}, outDir, log = () => {} }) {
  const session = new Session({ authFile: join(ROOT, ".auth", "ffb-session.json"), log });
  await session.login(credentials);

  const udk = await loadEngine({
    session,
    season,
    scoringSystem: credentials.scoringSystem,
    leagueSize: league.teams?.length ?? credentials.leagueSize,
    log,
  });

  if (outDir) mkdirSync(outDir, { recursive: true });

  const rows = [];
  const counts = {};
  const problems = [];

  for (const { pos, kind } of POSITIONS) {
    let parsed = [];
    try {
      if (kind === "skill") {
        parsed = udk.positionRankings(pos).map((r) => skillRow(r, pos, udk.leagueSize));
      } else if (pos === "DST") {
        parsed = udk.defense.map((r) => consensusRow(r, "DST"));
      } else {
        parsed = udk.kickers.map((r) => consensusRow(r, "K"));
      }
      parsed = parsed.filter((r) => r.name);
    } catch (err) {
      problems.push(`${pos}: ${err.message}`);
      counts[pos] = 0;
      continue;
    }

    rows.push(...parsed);
    counts[pos] = parsed.length;
    if (outDir && parsed.length) writeFileSync(join(outDir, `ffb_${pos}.csv`), toCsv(parsed));
    log(`  ${pos.padEnd(4)} ${String(parsed.length).padStart(4)} players`);
  }

  session.save();
  return {
    rows,
    counts,
    problems,
    positions: POSITIONS,
    meta: { scoringSystem: udk.scoringSystem, leagueSize: udk.leagueSize, availableSystems: udk.systems },
  };
}
