import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source adapter: FantasyPros expert consensus rankings (ECR).
 *
 * This is the base list -- it supplies pros_rank, pros_tier and pos_rank_pros
 * for everyone, and it is the ONLY source for IDP. The Fantasy Footballers
 * don't rank defensive players at all (every IDP row in players.2025.json has
 * null in all five ffb_* fields), and James's league starts LB, DE and S. So
 * without this adapter the pool is unusable on draft day.
 *
 * There is nothing to scrape. FantasyPros server-renders each cheatsheet with a
 * `var ecrData = {...}` JSON blob in the page HTML -- no login, no nonce, no
 * borrowed engine. Two fetches and a JSON.parse is the whole ingest.
 *
 * Exports pull(), the same contract as ffb.mjs.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP, which is the reason for every assertion below.
 *
 * The obvious IDP URLs -- rankings/lb.php, rankings/dl.php, rankings/db.php --
 * return HTTP 200 and look completely right. They are IN-SEASON WEEKLY
 * rankings: standard scoring, one specific week, and no tier data at all. By
 * mid-August FantasyPros has already flipped its default pages to the regular
 * season. Only the `-cheatsheets.php` variants stay in draft mode.
 *
 * A pull built against the wrong URL produces a hundred plausible-looking
 * linebackers ranked for week one, with the tiers silently missing. That is
 * exactly the wrong-and-confident failure CLAUDE.md rule 1 exists to prevent,
 * so assertDraftMode() checks the payload's own metadata and throws by name
 * rather than trusting the URL to still mean what it means today.
 * ---------------------------------------------------------------------------
 */

const BASE = "https://www.fantasypros.com/nfl/rankings";

/**
 * FantasyPros serves plain HTML to a browser UA and a challenge page to some
 * default clients, so we identify as one. Nothing here is authenticated.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * The two pages, and what each must prove about itself before we believe it.
 *
 * `mins` are truncation floors, not forecasts. They sit well under both the
 * 2025 workbook and the current live counts, because their job is to catch a
 * table that came back half-empty -- not to have an opinion about how deep
 * FantasyPros chooses to rank tight ends this year.
 */
export const PAGES = [
  {
    key: "offense",
    file: "half-point-ppr-cheatsheets.php",
    // Half PPR is James's league. See PRODUCT.md.
    expect: { type: "Draft Half PPR", position_id: "ALL", scoring: "HALF" },
    mins: [
      { pos: "QB", min: 40 },
      { pos: "RB", min: 80 },
      { pos: "WR", min: 100 },
      { pos: "TE", min: 50 },
      { pos: "DST", min: 24 },
      { pos: "K", min: 24 },
    ],
  },
  {
    key: "idp",
    file: "idp-cheatsheets.php",
    // IDP has no half-PPR variant -- FantasyPros ranks defenders once, as STD.
    expect: { type: "Draft", position_id: "IDP", scoring: "STD" },
    mins: [
      { pos: "LB", min: 50 },
      { pos: "DE", min: 25 },
      { pos: "S", min: 25 },
      { pos: "CB", min: 8 },
      { pos: "DT", min: 8 },
    ],
  },
];

const numOrNull = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Pull the `var ecrData = {...}` blob out of the page.
 *
 * Brace-counting rather than a lazy regex: the blob is one line of ~900KB and
 * contains player page URLs with braces nowhere, but a non-greedy `\{.*?\}`
 * would still stop at the first nested object. Counting is unambiguous.
 */
export function extractEcrData(html) {
  const marker = html.indexOf("var ecrData");
  if (marker === -1) {
    throw new Error(
      "no `var ecrData` blob in the page — FantasyPros has restructured the cheatsheet. " +
        "Open the saved HTML in data/raw/ and find where the rankings moved to."
    );
  }
  const start = html.indexOf("{", marker);
  if (start === -1) throw new Error("found `var ecrData` but no opening brace after it");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error("`var ecrData` object never closed — the page is truncated");
}

/**
 * The guard against silently ingesting in-season weekly ranks. See the trap
 * note at the top of this file.
 *
 * `week: 0` and `ranking_type_name: "draft"` are how the payload says "these
 * are preseason draft rankings". A weekly page says `week: 1` and its type
 * reads `Weekly`. Checking the payload rather than the URL means this keeps
 * working if FantasyPros renames a page, and fails loudly if it repurposes one.
 */
function assertDraftMode(data, page, season) {
  const where = `${page.file}`;

  if (String(data.ranking_type_name).toLowerCase() !== "draft" || String(data.week) !== "0") {
    throw new Error(
      `${where} returned IN-SEASON rankings (type "${data.type}", week ${data.week}), not draft rankings. ` +
        `These have no tiers and are scored for a single week. Do not use them. ` +
        `The draft-mode pages are the "-cheatsheets.php" variants; if this one has been repurposed, ` +
        `find the current draft URL rather than loosening this check.`
    );
  }

  for (const [field, want] of Object.entries(page.expect)) {
    if (String(data[field]) !== want) {
      throw new Error(
        `${where}: expected ${field} "${want}", got "${data[field]}". ` +
          `The page is in draft mode but is not the list this adapter was built against ` +
          `— check the scoring and position filter before trusting these ranks.`
      );
    }
  }

  if (String(data.year) !== String(season)) {
    throw new Error(
      `${where} is ranking ${data.year}, but this refresh asked for ${season}. ` +
        `Writing these into players.${season}.json would put last season's ranks under this season's name.`
    );
  }
}

/**
 * One ecrData player -> our row shape.
 *
 * WHAT `pros_rank` MEANS HERE, because it is not obvious and it matters:
 * it is the rank within its own list, not a global rank across the pool. The
 * offense page numbers 1..~865 and the IDP page numbers 1..~203, and both start
 * at 1. players.2025.json does exactly the same thing (offense 1-481, IDP
 * 1-195), so this matches the file the app was built and validated against.
 * `tier` is likewise a whole-list tier, not a per-position one — Brock Bowers
 * is TE1 in tier 2, because seventeen non-tight-ends rank ahead of him.
 *
 * `sos` and `ecr_vs_adp` were in the 2025 export but are not in these payloads;
 * they live on different FantasyPros views. Left null deliberately — the focus
 * card already drops null rows, so they simply don't render. Deriving
 * ecr_vs_adp from the Fantasy Footballers' ADP would be a made-up cross-source
 * number wearing a real column's name.
 */
const toRow = (p) => ({
  name: String(p.player_name || "").trim(),
  pos: p.player_position_id || null,
  team: p.player_team_id || null,
  bye: numOrNull(p.player_bye_week),
  pros_rank: numOrNull(p.rank_ecr),
  pros_tier: numOrNull(p.tier),
  pos_rank_pros: p.pos_rank || null,
  eligibility: p.player_eligibility || null,
  sos: null,
  ecr_vs_adp: null,
  source: "fantasypros",
});

function toCsv(rows) {
  const cols = [...rows.reduce((s, r) => (Object.keys(r).forEach((k) => s.add(k)), s), new Set())];
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

/**
 * Fetch both cheatsheets and return { rows, counts, problems, positions }.
 *
 * Two GETs, no credentials, no state. The raw HTML and the parsed blob are both
 * written to data/raw/<MM_DD_YY>/ so any run can be re-read after the fact
 * without hitting the site again.
 */
export async function pull({ season, outDir, log = () => {} } = {}) {
  if (outDir) mkdirSync(outDir, { recursive: true });

  const rows = [];
  const counts = {};
  const problems = [];
  const positions = [];
  const meta = {};

  for (const page of PAGES) {
    const url = `${BASE}/${page.file}`;
    positions.push(...page.mins);

    let parsed;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const html = await res.text();
      if (outDir) writeFileSync(join(outDir, `pros_${page.key}.html`), html);

      // Parse and assert AFTER the raw page is on disk, so a failure leaves
      // something to look at instead of just an error message.
      parsed = extractEcrData(html);
      if (outDir) writeFileSync(join(outDir, `pros_${page.key}.json`), JSON.stringify(parsed, null, 2));
      assertDraftMode(parsed, page, season);
    } catch (err) {
      // Recorded rather than thrown: refresh.mjs turns a problem into a refusal
      // to write, which keeps the existing player pool intact and reports why.
      problems.push(`fantasypros ${page.key}: ${err.message}`);
      for (const { pos } of page.mins) counts[pos] = 0;
      log(`  ${page.key}: FAILED — ${err.message}`);
      continue;
    }

    meta[page.key] = {
      type: parsed.type,
      scoring: parsed.scoring,
      week: parsed.week,
      year: parsed.year,
      experts: parsed.total_experts,
      last_updated: parsed.last_updated,
    };

    const pageRows = (parsed.players || []).map((p) => toRow(p)).filter((r) => r.name && r.pos);
    rows.push(...pageRows);

    for (const { pos } of page.mins) {
      counts[pos] = pageRows.filter((r) => r.pos === pos).length;
    }

    const unexpected = [...new Set(pageRows.map((r) => r.pos))].filter(
      (p) => !page.mins.some((m) => m.pos === p)
    );
    if (unexpected.length) {
      // Not fatal — a new position still lands in the pool. But it is worth
      // saying, because it means this adapter's position list is out of date.
      problems.push(
        `fantasypros ${page.key}: returned unlisted position(s) ${unexpected.join(", ")} — ` +
          `add them to PAGES[].mins so they get a truncation floor`
      );
    }

    log(
      `  ${page.key.padEnd(8)} ${String(pageRows.length).padStart(4)} players ` +
        `(${page.mins.map(({ pos }) => `${pos} ${counts[pos]}`).join(", ")}) ` +
        `— ${parsed.type}, week ${parsed.week}, ${parsed.total_experts} experts, updated ${parsed.last_updated}`
    );

    if (outDir && pageRows.length) writeFileSync(join(outDir, `pros_${page.key}.csv`), toCsv(pageRows));
  }

  /**
   * A note about multi-position eligibility, which is easy to get wrong.
   *
   * Many rows carry `player_eligibility` like "LB,DE" or "DT,DE" or "CB,S".
   * These are NOT two-way players. They are FantasyPros saying which slot a
   * defender fills across different league formats — an edge rusher counts as
   * a linebacker on some platforms and a defensive end on others. Micah Parsons
   * is one human playing one position.
   *
   * So we do NOT expand eligibility into extra rows. FantasyPros publishes one
   * rank per player (Parsons is LB54, and there is no DE rank for him); minting
   * a second row would mean inventing the number that goes in it, which is
   * CLAUDE.md rule 5. Position comes from `player_position_id`, one row in, one
   * row out.
   *
   * CLAUDE.md rule 8 still holds, and it needs no help from us: a genuine
   * two-way player appears on BOTH pages with a real rank on each, so he gets
   * two rows out of real data. That is exactly how Travis Hunter came to hold a
   * WR row and a CB row in players.2025.json. (In 2026 he is on the offense
   * page only — FantasyPros no longer ranks him as a defender — so this year he
   * is correctly one row.)
   *
   * The raw string is carried through on `eligibility` so the ambiguity is
   * recorded in the data rather than lost in this comment.
   */
  const multi = rows.filter((r) => (r.eligibility || "").includes(","));
  if (multi.length) {
    log(
      `\n  ${multi.length} players list multiple eligible positions (e.g. ${multi
        .slice(0, 3)
        .map((r) => `${r.name} ${r.eligibility}`)
        .join(", ")}).`
    );
    log(`  Kept as one row each at their ranked position — see the note in fantasypros.mjs.`);
  }

  return { rows, counts, problems, positions, meta };
}
