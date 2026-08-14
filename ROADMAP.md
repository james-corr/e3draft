# Roadmap

## Now

- Connect the live board: add the `DRAFT BOARD` tab to the shared sheet, share it link-viewable, create the Google API key, fill in `config.json`
- Confirm the keeper rule detail — which round the forfeited pick comes from
- Replace the 2025 player data with this year's FantasyPros + Fantasy Footballers exports
- Rewrite the 9 contingency plans for this season (they currently hold 2025's targets)

## Next

- Editing plans in the app instead of by hand in `data/branches.<year>.json`
- Round-anchored notes surfaced in the interface (10 are extracted and stored, nothing renders them yet)
- Tag editing (Breakout / Sleepers / Busts / Late Round Fliers / My Guys) — the storage and the unified model exist, only starring is wired to the UI
- Pre-fill keeper picks on the board tab once the round rule is settled

## Later

- Bye-week and roster-need warnings against the confirmed starting lineup
- Position-scarcity view across all positions at once, rather than one at a time
- Ingest Fantasy Footballers podcast transcripts and query them with an LLM over transcripts + rankings (explicitly deferred; storage is kept flat and file-based so this stays possible)

## Shipped

- Design: camcorder-viewfinder world, SUN/NIGHT exposures, self-hosted DSEG14 + Saira Condensed, recorded in PRODUCT.md and DESIGN.md; finish review closed with every finding resolved
- Draft-day interface: board grid, tier-banded available pool, plan health, my team, transactions, target locking
- Engine: taken/available, tier counts, rosters, snake pick order, plan health — 1.75ms per recompute
- Name matcher: 216/216 real 2025 picks matched, unmatched picks surfaced rather than dropped
- Live plumbing: Google Sheets API read, change-detecting poll loop, SSE push
- Board-tab generator (`tools/make-board-tab.mjs`) — the new dumb shared board
- Migration off the old workbooks (`tools/extract_from_xlsx.py`): 676 players, 9 contingency plans, 10 round notes, 2025 draft as a test fixture
