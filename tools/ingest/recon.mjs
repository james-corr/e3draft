#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadIngestConfig, ROOT, stamp } from "./config.mjs";
import { Session } from "./session.mjs";
import { udkLiteral } from "./udk-engine.mjs";

/**
 * Reconnaissance against the UDK page. Kept in the repo because the next person
 * to hit a changed site needs exactly this again.
 *
 * The UDK ships projections and computes rankings in the browser, so the useful
 * question is not "what does the table look like" (it is empty) but "are the
 * pieces the ingest depends on still there": the REST nonce, the scoring
 * systems, the projections endpoint, the D/ST and K arrays, and the
 * UdkRankings class in their bundle.
 *
 *   node tools/ingest/recon.mjs
 */

const BUNDLE = "https://s26212.pcdn.co/wp-content/plugins/ffb-master/js/build/ffb-udk.js";
const OUT = join(ROOT, "data", "raw", `recon_${stamp()}`);

const cfg = await loadIngestConfig();
const session = new Session({ authFile: join(ROOT, ".auth", "ffb-session.json"), log: console.log });
await session.login(cfg.ffb);

const season = Number(process.argv[2]) || cfg.season;
const url = `/${season}-ultimate-draft-kit/udk-position-rankings/?position=QB`;
console.log(`fetching ${url}`);
const res = await session.fetch(url);
const html = await res.text();

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "page.html"), html);

const report = [];
const say = (s) => {
  report.push(s);
  console.log(s);
};
const check = (label, ok, detail = "") => say(`  ${ok ? "OK  " : "GONE"} ${label}${detail ? ` — ${detail}` : ""}`);

say(`# UDK recon — ${season} — ${new Date().toISOString()}`);
say(`HTTP ${res.status}, ${html.length} bytes -> ${join(OUT, "page.html")}\n`);

say("## access");
check("member content", !/to unlock|Purchase the \d{4} Ultimate Draft Kit/i.test(html), "no paywall prompt");

say("\n## the pieces the ingest depends on");
const nonce = html.match(/'api_nonce':\s*"([a-f0-9]+)"/)?.[1];
check("REST nonce (window.udk.rest_api.api_nonce)", Boolean(nonce));
for (const name of ["defaultScoringSystems", "defaultTeamComposition", "defaultLeagueSize", "defaultScoringSystem"]) {
  check(`window.udk.${name}`, new RegExp(`window\\.udk\\.${name}\\s*=`).test(html));
}
for (const name of ["defenseRankings", "kickerRankings"]) {
  const n = html.match(new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*\\[`)) ? "present" : "";
  check(`page array ${name}`, Boolean(n));
}

say("\n## scoring systems offered");
try {
  say(`  ${Object.keys(udkLiteral(html, "defaultScoringSystems")).join(" | ")}`);
  say(`  default: ${html.match(/window\.udk\.defaultScoringSystem\s*=\s*'([^']+)'/)?.[1] ?? "?"}`);
} catch (err) {
  say(`  could not read them: ${err.message}`);
}

say("\n## projections endpoint");
if (nonce) {
  const pr = await session.fetch("/wp-json/ffb/v1/udk/projections", {
    headers: { "X-WP-Nonce": nonce, accept: "application/json" },
  });
  check("GET /wp-json/ffb/v1/udk/projections", pr.ok, `HTTP ${pr.status}`);
  if (pr.ok) {
    const data = JSON.parse((await pr.json()).json);
    writeFileSync(join(OUT, "projections.json"), JSON.stringify(data, null, 1));
    for (const [k, v] of Object.entries(data)) {
      say(`    ${k.padEnd(22)} ${Array.isArray(v) ? `array[${v.length}]` : typeof v}`);
    }
    const p = data.projections?.[0] ?? {};
    for (const f of ["name", "fantasy_position", "team", "bye_week", "risk", "upside", "adp_half_ppr"]) {
      check(`projections[].${f}`, f in p);
    }
  }
}

say("\n## ranking engine");
const bundle = await (await fetch(BUNDLE)).text();
check("class UdkRankings in ffb-udk.js", bundle.includes("class UdkRankings"), `${bundle.length} bytes`);
for (const m of ["addProjection", "addPreviousProjection", "calculate", "getPositionRankings"]) {
  check(`UdkRankings.${m}`, bundle.includes(m));
}

say("\n## positions offered");
say(`  ${[...new Set([...html.matchAll(/udk-position-rankings\/\?position=([A-Za-z]+)/g)].map((m) => m[1]))].join(", ")}`);

writeFileSync(join(OUT, "RECON.md"), report.join("\n") + "\n");
console.log(`\nreport -> ${join(OUT, "RECON.md")}`);
