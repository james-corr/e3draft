/**
 * The Ultimate Draft Kit's own ranking engine, run locally.
 *
 * Why it works this way
 * --------------------
 * The UDK rankings table is empty in the HTML. The site ships raw *projections*
 * and computes ranks, tiers and ADP in the browser, because the numbers depend
 * on your scoring system and league size. So there is no table to scrape and no
 * "rankings" endpoint to call.
 *
 * There were two ways forward: reimplement their maths, or run it. Their
 * `UdkRankings` class turns out to be ~16KB of pure computation -- no DOM, no
 * jQuery, no network -- so we lift it out of their bundle and run it in Node
 * against the projections they serve us. The numbers are then identical to what
 * James sees on the site by construction, rather than by our arithmetic
 * happening to agree with theirs. A ranking we computed slightly differently
 * from the site would be worse than no ranking at all: it would look right.
 *
 * What this costs: one page load and one API call per refresh, and a dependency
 * on their bundle keeping a class named UdkRankings. If they rename it this
 * throws by name and tells you where to look.
 */

const BUNDLE = "https://s26212.pcdn.co/wp-content/plugins/ffb-master/js/build/ffb-udk.js";

/**
 * Brace-match a balanced literal out of a source string, starting at `from`.
 * String-aware so a brace inside "Bye {1}" cannot end the match early.
 */
function balanced(src, from) {
  const open = src[from];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error("unbalanced literal");
}

/**
 * Read a `window.udk.<name> = <literal>` out of the page.
 * These are JS object literals with unquoted keys, not JSON, so they are
 * evaluated rather than parsed. The input is a page we fetched from an
 * authenticated session on their own domain -- the same code the browser runs.
 */
export function udkLiteral(page, name) {
  const m = page.match(new RegExp(`window\\.udk\\.${name}\\s*=\\s*`));
  if (!m) throw new Error(`window.udk.${name} not found on the page — the UDK page layout changed`);
  const start = m.index + m[0].length;
  if (!"[{".includes(page[start])) throw new Error(`window.udk.${name} is not an object or array literal`);
  return new Function(`return (${balanced(page, start)})`)();
}

/** Same, for the plain `var defenseRankings = [...]` arrays further down the page. */
function pageArray(page, name) {
  const m = page.match(new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*\\[`));
  if (!m) return [];
  return new Function(`return (${balanced(page, m.index + m[0].length - 1)})`)();
}

/** Pull the UdkRankings class source out of their bundle. */
function extractRankingsClass(bundle) {
  const i = bundle.indexOf("class UdkRankings");
  if (i < 0) {
    throw new Error(
      "UdkRankings class not found in ffb-udk.js — Fantasy Footballers changed their bundle. " +
        "Re-run tools/ingest/recon.mjs and look for the class that computes rankings."
    );
  }
  const src = balanced(bundle, bundle.indexOf("{", i));
  return `class UdkRankings ${src}; return UdkRankings;`;
}

/**
 * Log in, gather everything a ranking run needs, and return a ready engine.
 *
 * `scoringSystem` must be one of the keys in `systems` (STD/HALF/PPR x 4pt/6pt
 * passing TD). It is not guessed: which one James's league uses is a league
 * fact, and league facts come from him.
 */
export async function loadEngine({ session, season, scoringSystem, leagueSize, log = () => {} }) {
  const pageUrl = `/${season}-ultimate-draft-kit/udk-position-rankings/?position=QB`;
  const res = await session.fetch(pageUrl, { headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${pageUrl}`);
  const page = await res.text();

  if (/to unlock|Purchase the \d{4} Ultimate Draft Kit/i.test(page)) {
    throw new Error(
      `The ${season} UDK is showing its purchase prompt for this account. ` +
        `Check that the season in config.json matches the kit you own.`
    );
  }

  const nonce = page.match(/'api_nonce':\s*"([a-f0-9]+)"/)?.[1];
  if (!nonce) throw new Error("no REST nonce on the UDK page — cannot call their projections endpoint");

  const systems = udkLiteral(page, "defaultScoringSystems");
  const teamComposition = udkLiteral(page, "defaultTeamComposition");
  const size = leagueSize ?? udkLiteral(page, "defaultLeagueSize") ?? 12;

  const chosen = scoringSystem ?? page.match(/window\.udk\.defaultScoringSystem\s*=\s*'([^']+)'/)?.[1];
  if (!systems[chosen]) {
    throw new Error(
      `Unknown scoring system "${chosen}". The UDK offers: ${Object.keys(systems).join(", ")}. ` +
        `Set "ffb": { "scoringSystem": "..." } in config.json.`
    );
  }
  log(`  scoring: ${chosen}, ${size}-team`);

  // Projections. Cookie-authenticated WordPress REST needs the nonce header.
  const pr = await session.fetch("/wp-json/ffb/v1/udk/projections", {
    headers: { "X-WP-Nonce": nonce, accept: "application/json" },
  });
  if (!pr.ok) throw new Error(`HTTP ${pr.status} from udk/projections`);
  // Their own comment calls the double encoding unfortunate; it is still what ships.
  const data = JSON.parse((await pr.json()).json);

  const bundleRes = await fetch(BUNDLE, { headers: { "user-agent": "e3draft-ingest" } });
  if (!bundleRes.ok) throw new Error(`HTTP ${bundleRes.status} fetching ffb-udk.js`);
  const UdkRankings = new Function(extractRankingsClass(await bundleRes.text()))();

  const engine = new UdkRankings(systems[chosen], {
    tiers: data.tiers,
    defaultTeamComposition: teamComposition,
    leagueSize: size,
    top200: data.top200_multipliers,
    "2qb": data["2qb_multipliers"],
  });
  for (const p of data.projections) engine.addProjection(p);
  for (const p of data.previous_projections) engine.addPreviousProjection(p);
  engine.calculate();

  return {
    engine,
    scoringSystem: chosen,
    leagueSize: size,
    systems: Object.keys(systems),
    /** Ranked rows for a skill position, exactly as the site's table shows them. */
    positionRankings: (pos) => engine.getPositionRankings(pos) ?? [],
    /**
     * D/ST and K are ranked by analyst consensus rather than projections, so the
     * site renders them from arrays baked into the page. Same for us.
     */
    defense: pageArray(page, "defenseRankings"),
    kickers: pageArray(page, "kickerRankings"),
  };
}
