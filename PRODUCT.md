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

One user: James. Twelve-team league, twenty rounds, snake order. He types every pick in the
draft into this app — his own and everyone else's — so there are no secondary users and no
second surface. (Through 2025 the league co-edited a shared Google Sheet board and this app
read it; that arrangement ended 08/24/26.)

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
- **There is no shared board.** James enters every pick himself, into this app, on the laptop
  in front of him. The app owns the draft record outright — `data/board.<season>.json` — and
  nothing else writes it. Decided 08/24/26; it replaced a shared Google Sheet the league
  co-edited.
- Every calculation happens locally, in memory. The old setup used IMPORTRANGE plus chained
  formulas across ~800 players, which is what made it too slow.
- Ranking data comes from FantasyPros consensus as the base player list, enriched with Fantasy
  Footballers tier/risk/ADP/upside. **Automated since 08/18/26** — `npm run refresh` pulls the
  Fantasy Footballers UDK directly (`tools/ingest/`). This reverses the earlier "scraping is out
  of scope" decision, which had made a manual hour-long chore of the one thing that has to be
  current on draft day. The FantasyPros side is not automated yet.
- FantasyPros is the base *list* and the sort order; the Fantasy Footballers tier is the *tier*
  James drafts off. **Changed 08/25/26** — ON THE BOARD banded by FantasyPros tier until then,
  with the FFB tier printed on the row as a secondary figure. It now bands by FFB tier and falls
  back to FantasyPros only where FFB has none. The known cost, accepted deliberately: the two
  sources scale tiers differently, so a single band can hold both and its "N left" count mixes
  them. The alternative — FFB in position views only — was considered and turned down.

## Capabilities and Constraints

- **League:** 12 teams, 20 rounds, snake draft. James's team is "Jimmy", drafting 10th. The
  2025 board only ever got 18 rounds filled in — a habit of the league, not a shorter draft.
- **Scoring:** half-PPR (0.5 per reception), **6 points per passing touchdown**. Both confirmed
  by James (08/18/26 and again 08/23/26) and they select which of the UDK's six ranking sets we
  pull; the 6-point passing TD moves QBs several spots. Every scoring value in the league is
  transcribed in `SCORING.md` and copied into `data/league.json`.
- **Starting lineup (12):** 1 QB, 3 WR, 2 RB, 1 TE, 1 W/R/T flex, 1 K, 1 DEF, and **two IDP
  slots — one open `D` and one `DB`** (confirmed 08/23/26; this file previously said three
  slots, LB/DE/S, which was wrong). Then 6 bench and 2 IR: **20 roster spots for 20 rounds.**
  `D` takes any defender, `DB` only a CB or S — so a safety is worth more spent on the `DB`.
- **Keepers:** one keeper per team, costing a draft pick. **Which round the forfeited pick
  comes from needs no general rule** (settled 08/24/26): James types each keeper into that
  manager's cell for that round, so the round cost is stated per team as a fact rather than
  derived from a policy. Keeper cells carry a `K` on the board and survive CLEAR BOARD.
- **Player pool:** 676 players across QB/RB/WR/TE/DST/K and IDP (LB, DE, DT, S, CB). A two-way
  player legitimately appears once per position and is one human — drafting him removes every
  one of his rows.
- **Speed budget:** one to three seconds from a leaguemate typing a pick to it appearing here.
  Local recompute measures 1.75ms, so effectively the entire budget is network round-trip.
- **Name matching is the real risk.** Picks are hand-typed under time pressure.
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
- `SCORING.md` — every scoring value and roster slot, transcribed from the Yahoo settings page
  on 08/20/26, with the source screenshots kept in `scoring/`. `data/league.json` carries the
  machine-readable copy in `rosterSlots` and `scoring`.
- Source workbooks: `E3 Draft 2025.xlsx`, `JPC USE - Draft 2025 - in use.xlsx`.

Not on hand and not to be fabricated: this year's rankings, this year's keeper selections, and
the 2026 draft date. (The keeper round-cost rule was on this list until 08/24/26; it is off it
because keepers are now entered cell by cell, so there is no rule left to fabricate.)

## Product Principles

1. **Wrong-and-confident is the only unacceptable failure.** Showing a drafted player as
   available loses James a pick. Uncertainty gets surfaced, never smoothed over.
2. **The board file stays dumb; the app holds the logic.** The board is a grid of typed names
   and nothing else. Every calculation that isn't in `lib/state.js` is a thing that can drift
   out of agreement with the one that is.
3. **Glanceable beats complete.** On the clock, James reads the screen for seconds. Density is
   fine; hunting is not.
4. **Carry his years of accumulated judgment forward.** The branch plans and round notes are
   the real asset in the old spreadsheet, not the formulas.
5. **The yearly refresh is a product feature.** Two file drops, not an afternoon.

## Accessibility & Inclusion

Sunlight legibility on a laptop panel is the binding requirement: high contrast throughout,
no information carried by color alone (tier and taken/available state need a second cue), and
type large enough to read at arm's length in glare.
