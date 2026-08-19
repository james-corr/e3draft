---
Date last edited: 08_18_26
Date created: 08_18_26
---

> **Partly superseded by `08_19_26_merged-plan.md` (08/19/26).** The architecture, the safety gate
> and the FFB reasoning below are still live reference. The "What's next" section is replaced, and
> the FantasyPros recon it asks for has been done — see the merged plan.

# e3draft — rankings ingest handoff (pick up here)

Read this before touching `tools/ingest/`. It records what was built on 08/18/26, why it works
the way it does, and what is genuinely left.

Status: **the Fantasy Footballers half is done and working.** The FantasyPros half is not
started. The app still displays 2025 and is deliberately unchanged.

---

## What this session set out to do

Automate the rankings pull that `ROADMAP.md` had under **Now**. It was the last thing still done
by hand: log into thefantasyfootballers.com, click through six positions, download six CSVs,
merge them in Excel. James asked for a backend data flow that could do it on demand, with a
second source (FantasyPros) to follow.

---

## The finding that shaped everything

**The UDK has nothing to scrape.** Its rankings table is empty in the HTML. The site ships raw
*projections* and computes ranks, tiers and ADP in the browser, because the numbers depend on
your scoring system and league size. There is no rankings endpoint, and the "Download CSV"
button builds its file client-side from data already in the page.

So the choice was: reimplement their maths, or run it.

Their `UdkRankings` class turned out to be **~16KB of pure computation — no DOM, no jQuery, no
network**. So `tools/ingest/udk-engine.mjs` lifts it out of their bundle and runs it in Node
against the projections their own API serves. The numbers match the site *by construction*
rather than because our arithmetic happened to agree with theirs.

That reasoning is worth preserving: **a ranking we computed slightly differently would be worse
than no ranking at all, because it would look right.**

Consequences:
- **Zero dependencies.** No Playwright, no browser. The `CLAUDE.md` convention survives intact.
- The whole footprint is **one page load, one API call, one static asset** per refresh — lighter
  than opening the page in a browser, which is what it replaces.

### How the pieces connect

```
config.json ──▶ session.mjs      wp-login.php + cookie jar, cached in .auth/
                    │
                    ▼
              udk-engine.mjs     page  ──▶ nonce, scoring systems, D/ST + K arrays
                    │            API   ──▶ /wp-json/ffb/v1/udk/projections (needs X-WP-Nonce)
                    │            CDN   ──▶ ffb-udk.js ──▶ class UdkRankings
                    ▼
                  ffb.mjs        maps ranked rows -> our field shape, writes raw CSVs
                    │
                    ▼
                 merge.mjs       outer join on normalizeName(name)|pos
                    │
                    ▼
               validate.mjs      the gate — see below
                    │
                    ▼
             players.<year>.json (temp-file + rename)
```

---

## Facts established (don't re-derive these)

- **thefantasyfootballers.com is MemberPress on plain WordPress.** Email + password, no SSO.
  Login is a form POST to `wp-login.php`; everything after is cookie-carried.
- **WordPress REST needs `X-WP-Nonce` for cookie auth.** Without it a perfectly good session gets
  a `401`. The nonce is on the UDK page as `window.udk.rest_api.api_nonce`. *This cost time once
  already — an early version used that 401 as a "no subscription" check, which could never have
  passed for anyone.*
- **The UDK ranks exactly: QB, RB, WR, TE, D, K, FLEX.**
  - FLEX is skipped — it is RB/WR/TE re-listed, so pulling it duplicates every skill player.
  - **There is no IDP. None.** No LB, DE, S, DT, CB.
  - D/ST and K come from `defenseRankings` / `kickerRankings` baked into the page (consensus
    rank only — no tier/risk/upside/ADP), which matches how the old workbook stored them.
- **Rankings depend on scoring.** The UDK publishes six sets: STD/HALF/PPR × 4pt/6pt passing TD.
  James confirmed **half-PPR, 6-point passing TDs** on 08/18/26 — now in `PRODUCT.md`. It is not
  cosmetic: seven QBs move three or more spots between the 4pt and 6pt sets.
- **ADP is round.pick** (`1.02` = round 1, pick 2), derived from league size. Matches the 2025
  file and what `public/util.js` prints.
- **The join key is safe.** `normalizeName(name)|pos` over the real 676-player 2025 file gives
  676 distinct keys, zero collisions. It correctly merges `D.K. Metcalf` with `DK Metcalf`.

---

## The safety gate

`CLAUDE.md` rule 1 is "never let a pick fail silently." The same logic applies upstream: a
refresh that half-works and quietly overwrites the pool would show drafted players as available
on draft day. Nothing is written unless **all** of these pass:

- every position clears a row-count floor
- the total is within ±25% of the file being replaced
- no duplicate ids
- numeric fields are actually numeric
- the top-ranked entry at each position looks like a real name

Plus two structural guards:

- **Partial-refresh guard.** A run that pulled no FantasyPros data will refuse to overwrite a
  file that *has* FantasyPros columns. Without this, `--source=ffb` would silently delete the
  other source's work and the loss would surface on draft day.
- **Mid-draft guard.** `POST /api/refresh` returns 409 once the board has picks.

Writes go through temp-file + rename, matching `lib/store.js`.

**Drill result:** with a wrong password, `players.2026.json` came back byte-identical. Verified.

---

## Files

| File | What it does |
|---|---|
| `tools/ingest/session.mjs` | WP login, cookie jar, `.auth/` persistence, `verify()`, `checkUdkAccess()` |
| `tools/ingest/udk-engine.mjs` | Fetches the page/API/bundle, extracts + runs `UdkRankings` |
| `tools/ingest/ffb.mjs` | Source adapter — exports `pull()`. A second source = another module with this one function |
| `tools/ingest/merge.mjs` | Outer join, reuses `normalizeName` from `lib/players.js` |
| `tools/ingest/validate.mjs` | The gate |
| `tools/ingest/refresh.mjs` | Orchestrator; what the CLI and the API route both call |
| `tools/ingest/recon.mjs` | Diagnostic — checks each piece the pull depends on |
| `tools/ingest/set-login.mjs` | Prompts for credentials, verifies, saves. Password never hits shell history |
| `tools/ingest/config.mjs` | Shared paths, `MM_DD_YY` stamp, config loading |

Touched: `server.js` (`/api/refresh`, `reloadPool()`, season from config), `public/setup.js`
(REFRESH FROM UDK), `package.json`, `README.md`, `PRODUCT.md`, `ROADMAP.md`, `.gitignore`,
`config.example.json`.

Two commits on `main`: `898fb63`, `6b564cc`. **Not pushed** — flagged per the git rule as a new
backend subsystem.

---

## Current state

- `data/players.2026.json` — **377 players**, written and validated. QB 36, RB 91, WR 131,
  TE 54, K 33, DST 32.
- `config.json` has `season: 2025`, `ffb.scoringSystem: "HALF (6pt QB)"`, and credentials.
- The app boots on 2025 exactly as before: **676 players, 51 picks, 0 unmatched, 9 plans.**
- Session cached in `.auth/`. Raw pulls under `data/raw/<MM_DD_YY>/`.

### Why the app was NOT switched to 2026

Deliberate. The 2026 pool has **no IDP**, and the league starts LB/DE/S — so flipping now would
make every IDP pick show as unmatched on draft day. That is precisely the failure rule 1 exists
to prevent. **Switch only after FantasyPros is in.**

Note the two seasons are separate on purpose: `config.season` is what the app *displays*; a
refresh always pulls the *current year*. `/api/refresh` reloads the live pool only when those
match, and otherwise says which season it wrote.

---

## What's next

1. **FantasyPros adapter** — the real remaining work, and the blocker for everything else.
   Write `tools/ingest/fantasypros.mjs` exporting the same `pull()`. `merge.mjs` and
   `refresh.mjs` need no changes; add it to the `SOURCES` map. It supplies `pros_rank`,
   `pros_tier`, `pos_rank_pros`, `sos`, `ecr_vs_adp` — **and the entire IDP pool**.
   Start with recon: is it behind a login, and is the data server-rendered or client-computed?
   Do not assume it works like the UDK did.
2. **Then switch the season** — set `"season": 2026`, create `branches.2026.json` and
   `inventory.2026.json`. Missing files degrade gracefully (`readJson` falls back), but the 9
   plans are the real asset (rule 7) — carry them forward from 2025 rather than losing them.
3. **Rewrite the 9 plans** for this season — they still hold 2025's targets.
4. Still open from before: connect the live Google Sheet, settle the keeper round rule.

### If the pull breaks

Run `npm run recon`. It checks each piece — nonce, scoring systems, D/ST + K arrays, the
projections endpoint, and `class UdkRankings` in their bundle — and prints which one moved.
Every failure in the ingest names what it was looking for rather than returning empty data.

The one genuine fragility: we depend on their bundle keeping a class named `UdkRankings`. If
they rename or restructure it, `udk-engine.mjs` throws by name and points at recon. That was a
conscious trade against reimplementing their maths.

---

## Note for whoever picks this up

`PRODUCT.md` used to say scraping these sites was explicitly out of scope. That decision was
reversed on 08/18/26 with James's agreement, and the doc now says so. If you find any remaining
text implying the pull is manual, it is stale — fix it rather than working around it.
