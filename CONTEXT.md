---
Date last edited: 08_23_26
Date created: 08_13_26
---

# builds - e3draft

## What happens here

James's fantasy football draft setup, rebuilt. There were two linked Google Sheets; now there
is one Google Sheet and one local app.

1. **The shared board** — the file leaguemates enter picks into during the live draft. Stays a
   Google Sheet permanently; it is the only thing everyone can co-edit. Being rebuilt as a
   single dumb tab (`DRAFT BOARD`) added to the existing file, at the same URL.
2. **The command center** — was `JPC USE - Draft 2025 - in use`, a 22-tab Sheet. **Now a local
   app in this folder.** It reads the shared board and does every calculation itself.

The old setup took one to two hours to rebuild each year and couldn't keep up during the draft.

## Current state (08_18_26) — built and running

The app works end to end against real data. `npm start` or double-click `Start Draft.command`,
then <http://localhost:4173>.

**Measured, not estimated:**
- Full recompute: **1.75ms** against a 1–3 second target. The entire remaining budget is network
  round-trip to Google.
- Name matching: **216 of 216** real 2025 picks matched, zero failures.
- 676 players across 11 positions including full IDP.

**What's built:** the draft-day interface (20×12 board grid, tier-banded available pool, the 9
contingency plans with health meters, my team, transactions log, target locking), the whole
engine in `lib/`, the Google Sheets read path, a change-detecting poll loop pushing over SSE, the
board-tab generator, and the migration off the old workbooks.

**Added 08/18/26:**
- **The watchlist is one system.** A focus card behind every player name holds the lock, the five
  real tags (Breakout / Sleepers / Busts / Late Round Fliers / My Guys) and a note, all writing a
  single record. Tag chips filter the board, counted over players still available.
- **The round notes render.** Ten of James's own margin notes had been extracted since the
  migration with nothing showing them. They now run as a cue strip for the round in play (or the
  next one ahead) and as a band across their own round on the board.
- **A setup surface.** Plans and round notes are edited in the app instead of by hand in JSON.
  Names autocomplete against the pool and are checked by the same matcher that reads the board on
  draft day; saves keep a `.bak` and report anything dropped. This is what makes "rewrite the 9
  plans for this season" a job James can do himself.
- Fixed a real one found while measuring: the page scrolled 44px sideways at phone widths.

**Added 08/20/26:**
- **The real league settings are written down.** `SCORING.md` transcribes the Yahoo settings
  page — every scoring value for offense, kickers, team DEF and IDP, plus the exact roster
  slots. Screenshots of the source are in `scoring/`.
- It surfaced three conflicts with `PRODUCT.md`, all three now answered — see below.

**Added 08/23/26 — the league facts are settled.** James answered all three: **half-PPR, 20
rounds, and the IDP slots are `D` + `DB`.** Only the keeper round cost is still open.
- **Half-PPR was already right in the code.** Both ranking sources were pulling half-PPR
  already, confirmed from a real run. No ingest change and no re-run; the 2026 pool stands.
- **20 rounds was already right too.** It reconciles as 12 starters + 6 bench + 2 IR = 20, so
  the `totalPicks: 240` vs `madePicks: 216` gap was never a defect — the 2025 board just
  stopped being filled after round 18.
- **The IDP slots were the one real bug.** `MY TEAM` showed `LB 0/1 · DE 0/1 · S 0/1`, which
  was the old `PRODUCT.md` lineup rather than the league's, and it had no `W/R/T` flex at all.
  It now renders the real twelve, and the three composite slots — the flex, `D` and `DB` —
  allocate rather than look up: each pick is counted against the narrowest slot it still fits,
  so one safety can't fill both `D` and `DB`. Verified against James's real 2025 roster
  (12/12 starters, 6 bench, three defenders competing for two slots).
- **`data/league.json` now carries the machine-readable copy** in its `rosterSlots` and
  `scoring` fields, filled from `SCORING.md`. Nothing in `lib/` reads `scoring` yet — it is
  there so a projection or value column has one place to come from.

**What's not connected yet:** the live sheet. Until James does the one-time setup the app reads
`data/board.local.json` — the complete 2025 draft as a fixture — so it behaves exactly as it
will on the day. Steps are in `README.md`.

See `ROADMAP.md` for state and `PRODUCT.md` for the product record.

## Decisions locked in

**Architecture (08/13/26):**
- Shared board stays a Google Sheet. Non-negotiable.
- Command center is a local app, not a Sheet. IMPORTRANGE plus chained formulas across ~800
  players could never hit 1–3 seconds; in-memory calculation does it in under 2ms.
- Live connection is a read-only Google Cloud API key against a link-viewable sheet.
- **The board keeps its existing file and URL** (08/14/26) — a new tab gets added to it rather
  than starting a new sheet.

**League facts, captured from James (08/14/26) — these were in neither workbook:**
- Half-PPR. 12 teams, **20 rounds** (the 2025 board only ever got 18 filled), snake.
- Starting lineup, confirmed 08/23/26: 1 QB, **3 WR**, 2 RB, 1 TE, 1 W/R/T flex, K, DEF, and
  **two IDP slots — one open `D` and one `DB`**, not the three (LB/DE/S) recorded here until
  now. Then 6 bench and 2 IR — 20 spots for 20 rounds. `SCORING.md` is the record.
- One keeper per team, costing a draft pick. **Which round the forfeited pick comes from is
  still undecided — do not invent it.**
- James is "Jimmy", drafting 10th.

**Product (08/14/26):**
- The 9 contingency plans are **separate strategy branches**, each a full round-by-round target
  queue. Confirmed by James, was previously only an inference.
- Watchlist tags and starred targets are **one unified system**, not two mechanisms.
- Draft day is **in person, on a laptop, outdoors in bright daylight** — the binding constraint
  on the interface.

**Design (08/14/26):**
- Visual world is a **camcorder viewfinder OSD**. James chose it himself over the roll's
  assigned direction (newsprint sports agate), after being told its black ground conflicts with
  his sunlight constraint.
- Resolved with **two exposures and a toggle**: SUN (bright field, dark OSD ink) is the default
  because it matches the real draft scene; NIGHT is the world as shipped. `E` switches.
- Design review is now **on** for this project. It was off while this was assumed to be
  spreadsheets-only; that assumption is dead.

## Rules

- James is non-technical. Explain trade-offs plainly and recommend.
- Never let a pick fail silently — see `CLAUDE.md`, rule 1. It's the one expensive failure.
- Don't guess league rules. They came from James and live in `PRODUCT.md`.
- No live Google integration is connected for Claude — work from exported files.

## What's left

Top of `ROADMAP.md`. The scoring and roster questions are closed as of 08/23/26; what remains
needs James rather than code: connect the live sheet, settle the keeper round rule, and rewrite
the 9 plans and the round notes for this season (they hold 2025's targets today). The last one is now done in the app's setup surface
— the icon in the PLANS header.

## Where things live

| What | Where |
|---|---|
| How to run it, and the one-time Google setup | `README.md` |
| Product record — users, league rules, constraints | `PRODUCT.md` |
| Scoring values and roster slots, as set in Yahoo | `SCORING.md` (screenshots in `scoring/`) |
| The same, machine-readable | `rosterSlots` and `scoring` in `data/league.json` |
| House rules for working in here | `CLAUDE.md` |
| State | `ROADMAP.md` |
| The engine | `lib/state.js` |
| The design system, as shipped | `DESIGN.md` |
| Editing plans and round notes | the setup icon in the PLANS header |
| The new shared-board tab | `node tools/make-board-tab.mjs` → `out/DRAFT BOARD.csv` |
| Original workbooks | `E3 Draft 2025.xlsx`, `JPC USE - Draft 2025 - in use.xlsx` |
| Earlier planning (superseded, kept for reasoning) | `plans/` |
