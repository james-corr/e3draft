# Roadmap

## Now

Everything here needs James, not code.

- Connect the live board: add the `DRAFT BOARD` tab to the shared sheet, share it link-viewable, create the Google API key, fill in `config.json`
- Confirm the keeper rule detail — which round the forfeited pick comes from
- Automate the FantasyPros half of the rankings pull (the Fantasy Footballers half is done)
- Switch the app over to 2026: `season` in `config.json`, plus `branches.2026.json` and `inventory.2026.json`
- Rewrite the 9 contingency plans and the round notes for this season — now done in the app's setup surface rather than by hand

## Next

- Pre-fill keeper picks on the board tab once the round rule is settled
- Reordering plans, and duplicating one as the starting point for another
- A rankings importer, so step 2 of the yearly refresh is a file drop rather than a JSON shape to match

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
