# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Zero-dependency Node HTTP server (ESM) plus plain HTML/CSS/JS, no framework and no build
step. Decided before this flow: it matches `builds/thursday/`, James's other personal tool, so
he has one consistent way of running things — `npm start`, open a browser tab. Data is flat
JSON files on disk.

## Users

One user: James, drafting his fantasy football team. Twelve-team league, twenty rounds, snake
order; he picks tenth. His leaguemates are secondary users who only ever touch the shared
Google Sheet board, never this app.

## Product Purpose

Decision support during a live draft. When James is on the clock he has roughly a minute to
answer: who's actually still available, how thin is the tier I care about, which of my planned
strategies is still intact, and did the guy I wanted just go?

Replaces two linked Google Sheets that took one to two hours to rebuild each year and could not
update fast enough during the draft. Success is (a) the screen reflects a new pick within one
to three seconds, and (b) next year's refresh is dropping in two ranking exports instead of
rewiring twenty tabs of formulas.

## Positioning

Not a generic draft assistant. It is James's own board, carrying his own contingency plans and
his own round-anchored notes accumulated over years of drafts — the things no commercial tool
knows. Its live truth comes from the league's real shared board, not from a rankings feed.

## Operating Context

- **The draft is in person, on a laptop, outdoors in bright daylight.** This is the governing
  physical constraint on the interface: sunlight on a laptop panel. It rules out dark grounds
  (they mirror-reflect outdoors), low-contrast greys, and light type weights.
- Leaguemates enter picks into a shared Google Sheet as they happen. That sheet stays a Google
  Sheet permanently — it is the one thing everyone can co-edit live. Non-negotiable.
- This app reads that sheet read-only via a Google Cloud API key and does every calculation
  locally. The old setup used IMPORTRANGE plus chained formulas across ~800 players, which is
  what made it too slow.
- Ranking data comes from FantasyPros consensus as the base player list, enriched with Fantasy
  Footballers tier/risk/ADP/upside. **Automated since 08/18/26** — `npm run refresh` pulls the
  Fantasy Footballers UDK directly (`tools/ingest/`). This reverses the earlier "scraping is out
  of scope" decision, which had made a manual hour-long chore of the one thing that has to be
  current on draft day. The FantasyPros side is not automated yet.

## Capabilities and Constraints

- **League:** 12 teams, 20 rounds, snake draft. James's team is "Jimmy", drafting 10th.
- **Scoring:** half-PPR (0.5 per reception), **6 points per passing touchdown** (confirmed by James 08/18/26 — it selects which of the UDK's six ranking sets we pull, and moves QBs several spots).
- **Starting lineup:** 1 QB, 2 RB, 3 WR, 1 TE, 1 FLEX, plus DST, K, and IDP slots (LB, DE, S).
  Remainder is bench.
- **Keepers:** one keeper per team, costing a draft pick. *Undecided and not to be invented:
  which round the forfeited pick comes from.*
- **Player pool:** 676 players across QB/RB/WR/TE/DST/K and IDP (LB, DE, DT, S, CB). A two-way
  player legitimately appears once per position and is one human — drafting him removes every
  one of his rows.
- **Speed budget:** one to three seconds from a leaguemate typing a pick to it appearing here.
  Local recompute measures 1.75ms, so effectively the entire budget is network round-trip.
- **Name matching is the real risk.** Picks are hand-typed into the sheet under time pressure.
  A pick that fails to match would leave a drafted player showing as available — the single
  worst failure this app can have — so unmatched entries must be surfaced loudly, never dropped.
- **Deferred, do not build:** ingesting Fantasy Footballers podcast transcripts for LLM-backed
  research. Keep storage flat and file-based so this stays possible.

## Evidence on Hand

Real, in this repo, extracted from the 2025 workbooks:

- `data/players.2025.json` — 676 real players with real FantasyPros and Fantasy Footballers
  numbers.
- `data/branches.2025.json` — James's nine real contingency plans, four of them named
  ("RB RB > WR WR WR", "WR > RB", "RB > WR", "RB > WR > TE"), plus ten round-anchored notes in
  his own words ("***RB deadzone begin***", "23 - First K Picked (By me last year)",
  "23 - IDP!!! / LB / S FIRST").
- `data/board.local.json` — the complete 2025 draft, 216 picks, used as a test fixture.
- Source workbooks: `E3 Draft 2025.xlsx`, `JPC USE - Draft 2025 - in use.xlsx`.

Not on hand and not to be fabricated: this year's rankings, this year's keeper selections, the
2026 draft date, and the keeper round-cost rule.

## Product Principles

1. **Wrong-and-confident is the only unacceptable failure.** Showing a drafted player as
   available loses James a pick. Uncertainty gets surfaced, never smoothed over.
2. **The sheet stays dumb; the app holds the logic.** Every formula removed from the shared
   board is a thing that cannot break under a leaguemate's cursor mid-draft.
3. **Glanceable beats complete.** On the clock, James reads the screen for seconds. Density is
   fine; hunting is not.
4. **Carry his years of accumulated judgment forward.** The branch plans and round notes are
   the real asset in the old spreadsheet, not the formulas.
5. **The yearly refresh is a product feature.** Two file drops, not an afternoon.

## Accessibility & Inclusion

Sunlight legibility on a laptop panel is the binding requirement: high contrast throughout,
no information carried by color alone (tier and taken/available state need a second cue), and
type large enough to read at arm's length in glare.
