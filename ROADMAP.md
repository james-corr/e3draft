# Roadmap

Sequencing and reasoning live in `plans/08_19_26_merged-plan.md`. This is the checklist.

## Now

Blocking, and only James can answer. Both came out of the Yahoo settings screenshots in
`scoring/` (added 08/20/26) and both contradict `PRODUCT.md`:

1. **Is the league half-PPR or standard?** The Offense table in those screenshots has no
   Receptions row at all. If that means 0 PPR, then both sources are being pulled at the wrong
   scoring: the Fantasy Footballers set is `HALF (6pt QB)` and FantasyPros is
   `half-point-ppr-cheatsheets.php`. It is a one-line change in each plus a re-run, but every
   WR and pass-catching RB rank moves. Nothing else in the app changes.
2. **Are the IDP roster slots LB/DE/S, or D + DB?** The screenshot reads
   `QB, WR, WR, WR, RB, RB, TE, W/R/T, K, DEF, D, DB, BN x6, IR x2`. `PRODUCT.md` says
   LB, DE and S. If it is D + DB, then draft day wants the best defender available plus a
   defensive back, not one of each of three positions — which changes what "my team" shows
   and what a roster-need warning would say.

Then:

3. **Connect the live board** — `DRAFT BOARD` tab, link-viewable sharing, Google API key,
   `config.json`. ~15 minutes, needs James. Steps in `README.md`. Do this well before draft day
   so the leaguemate-types-a-name path is proven with slack.
4. **Rewrite the 9 plans and 10 round notes** for this season, in the app's setup surface.
   James's judgment, not a code task. The 2025 plans are carried forward as the starting point;
   67 of their 69 targets still resolve against the 2026 pool.
5. **Publish to GitHub** — last, on purpose. Public repo, `.xlsx` stripped from history (one
   workbook has a live Sheets URL inside it). Commands in
   `plans/archive/08_18_26_setup-editor-and-github_handoff.md`. Run `ListAgents` first.
   Decide first whether `scoring/` belongs in the repo — it is currently untracked.

Still needs James, blocking nothing but keeper pre-fill:

- Confirm the keeper rule detail — which round the forfeited pick comes from

## Next

- Pre-fill keeper picks on the board tab once the round rule is settled
- Reordering plans, and duplicating one as the starting point for another
- Decide whether two different players sharing a name and position should be able to hold two
  rows. FantasyPros 2026 ranks two separate Isaiah Williamses at WR; the id format is
  `name|pos`, so only one can land, and the refresh now reports the collapse instead of
  hiding it. Both are deep bench WRs, so this is a principle question, not an urgent one.

## Later

- Bye-week and roster-need warnings against the confirmed starting lineup
- Position-scarcity view across all positions at once, rather than one at a time
- Chase `sos` and `ecr_vs_adp` on other FantasyPros views if their absence is actually felt.
  They were in the 2025 file, are not in the cheatsheet payloads, and are left null — the focus
  card drops null rows, so nothing breaks.
- Ingest Fantasy Footballers podcast transcripts and query them with an LLM over transcripts + rankings (explicitly deferred; storage is kept flat and file-based so this stays possible)

## Shipped

- **2026 season, IDP included** (08/20/26): `players.2026.json` holds 1069 players across all
  eleven positions, where it held 377 offense-only. `branches.2026.json` carried forward from
  2025. Dress rehearsal replayed the full 2025 board against the 2026 pool: 212 of 216 picks
  matched, and the four misses (Pearsall, Marquise Brown, Amari Cooper, Thielen) surfaced as
  unmatched with surname suggestions rather than resolving to nobody.

- **FantasyPros source** (`tools/ingest/fantasypros.mjs`, 08/20/26): the only thing that ranks
  IDP, since the Fantasy Footballers rank no defensive players at all. Server-rendered
  `var ecrData` blob, no login — two fetches and a JSON.parse. Asserts on the payload's own
  metadata that it is in draft mode, because `rankings/lb.php` and friends return HTTP 200 with
  in-season weekly ranks and no tiers, verified. Position comes from `player_position_id`, not
  from `player_eligibility` — the "LB,DE" strings are format hints, not two-way players.

- Rankings ingest (`npm run refresh`): logs into thefantasyfootballers.com, runs the UDK's own
  ranking engine locally against their projections, and writes `data/players.<year>.json` behind a
  validation gate that refuses to overwrite good data with a bad pull. Zero dependencies.

- Setup surface: contingency plans and round notes edited in the app, names checked against the live matcher, save backed by a `.bak` and a report of anything dropped
- Watchlist: stars and the five real tags unified into one record per player, edited from a focus card, filterable on the board
- Round notes: the cue strip for the round in play, and every note written across its own round on the board
- Design: camcorder-viewfinder world, SUN/NIGHT exposures, self-hosted DSEG14 + Saira Condensed, recorded in PRODUCT.md and DESIGN.md; finish review closed with every finding resolved
- Draft-day interface: board grid, tier-banded available pool, plan health, my team, transactions, target locking
- Engine: taken/available, tier counts, rosters, snake pick order, plan health — 1.75ms per recompute
- Name matcher: 216/216 real 2025 picks matched, unmatched picks surfaced rather than dropped
- Live plumbing: Google Sheets API read, change-detecting poll loop, SSE push
- Board-tab generator (`tools/make-board-tab.mjs`) — the new dumb shared board
- Migration off the old workbooks (`tools/extract_from_xlsx.py`): 676 players, 9 contingency plans, 10 round notes, 2025 draft as a test fixture
