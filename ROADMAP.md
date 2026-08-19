# Roadmap

Sequencing and reasoning live in `plans/08_19_26_merged-plan.md`. This is the checklist.

## Now

In dependency order. Only one item is real engineering.

1. **FantasyPros adapter** (`tools/ingest/fantasypros.mjs`) — unblocked 08/19/26. The data is
   server-rendered as a `var ecrData` blob, no login: `half-point-ppr-cheatsheets.php` (862
   offense, tiered) and `idp-cheatsheets.php` (204 IDP, tiered). **Use the `-cheatsheets.php`
   URLs** — the plain `lb/dl/db.php` pages are in-season weekly ranks with no tiers. Expect the
   ±25% validation gate to trip on the first combined write; override once, deliberately, rather
   than loosening it.
2. **Switch to 2026** — `season` in `config.json`, plus `branches.2026.json` and
   `inventory.2026.json` carried forward from 2025. Then replay the 2025 board against the 2026
   pool as a dress rehearsal.
3. **Connect the live board** — `DRAFT BOARD` tab, link-viewable sharing, Google API key,
   `config.json`. ~15 minutes, needs James. Steps in `README.md`.
4. **Rewrite the 9 plans and 10 round notes** for this season, in the app's setup surface.
   James's judgment, not a code task.
5. **Publish to GitHub** — last, on purpose. Public repo, `.xlsx` stripped from history (one
   workbook has a live Sheets URL inside it). Commands in
   `plans/08_18_26_setup-editor-and-github_handoff.md`. Run `ListAgents` first.

Still needs James, blocking nothing but keeper pre-fill:

- Confirm the keeper rule detail — which round the forfeited pick comes from

## Next

- Pre-fill keeper picks on the board tab once the round rule is settled
- Reordering plans, and duplicating one as the starting point for another

## Later

- Bye-week and roster-need warnings against the confirmed starting lineup
- Position-scarcity view across all positions at once, rather than one at a time
- Ingest Fantasy Footballers podcast transcripts and query them with an LLM over transcripts + rankings (explicitly deferred; storage is kept flat and file-based so this stays possible)

## Shipped

- Rankings ingest (`npm run refresh`): logs into thefantasyfootballers.com, runs the UDK's own
  ranking engine locally against their projections, and writes `data/players.<year>.json` behind a
  validation gate that refuses to overwrite good data with a bad pull. 377 players, zero dependencies.

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
