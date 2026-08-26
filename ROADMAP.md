# Roadmap

Sequencing and reasoning live in `plans/08_19_26_merged-plan.md`. This is the checklist.

## Now

**The league facts are settled** (James, 08/23/26): half-PPR, 20 rounds, IDP is `D` + `DB`.
`SCORING.md` is the record and `data/league.json` carries the machine-readable copy. Two of the
three needed no code — both ranking sources were already pulling half-PPR, and `"rounds": 20`
was already right (12 starters + 6 bench + 2 IR = 20, so the 240-vs-216 gap was the 2025 board
stopping at round 18, not a defect). The IDP slots were the real bug and `MY TEAM` is fixed.

1. **Rewrite the 9 plans and 10 round notes** for this season. James's judgment, not a code
   task. The 2025 plans are carried forward as the starting point; 67 of their 69 targets still
   resolve against the 2026 pool. Plan names and targets are now editable directly on the FIELD
   screen; adding and removing rows is in the setup surface.

## Next

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

- **The board says what each team has taken** (08/25/26): a tally pinned under the grid, one row
  per position and one column per manager, so "does anybody still need a quarterback before I am
  up again" is a row scan instead of twelve column reads. Zeros stay on the page and go quiet;
  counts come off `rosters[].counts`, which `lib/state.js` already built, so keepers are in it
  the moment they are typed and an unmatched cell is deliberately out of it. The five IDP
  positions are one row — the league starts one open `D` and one `DB`, so "how many defenders"
  is the decision-shaped number and the LB-versus-DE split rides along as hover text.

- **LOAD KEEPERS, and CLEAR BOARD stops sparing them** (08/25/26): `KEEPERS26.md` is a
  hand-editable Manager/Player/Round table at the repo root; the new **LOAD KEEPERS** button on
  the BOARD screen writes each row onto its manager's cell the same way a typed-in keeper does.
  Now that reloading them is one click, CLEAR BOARD wipes keepers along with everything else
  instead of special-casing them — superseding the last bullet below. A manager name in the
  file that doesn't match a team in `league.json` is skipped and reported, never guessed.
  `lib/keepers.js`.

- **Any cell can be set, and keepers with it** (08/24/26): click any square on the board and
  type who is in it — the pick box fills whatever slot is next, this fills the slot you name.
  Ticking **KEEPER** marks the cell with a `K`; the marker is coordinates in `league.json`
  while the name stays in the grid, so the two cannot drift, and it travels with its column
  when the teams are reordered. Three things came with it:
  - **The keeper round cost stopped being an open question.** It was the last undecided league
    fact, blocking since 08/13. It never needed a rule — James enters each keeper in the round
    it actually costs, so the round is a fact rather than a policy.
  - **The clock scans instead of counting.** `onTheClock` was `pickAt(madePicks + 1)`, which
    with keepers pre-filled would have announced a slot N ahead of where a typed pick actually
    lands, N being the number of keepers. It now reads which slots are filled and agrees with
    `nextOpen`; `myNext` and `picksAway` count only slots still empty.
  - **Unmatched picks render.** They held a cell on disk and were counted by the clock, but the
    grid drew them as empty squares. They now carry the zebra and the text as typed, and
    clicking one reopens it with that text loaded to correct.
  - CLEAR BOARD kept keepers, because it was also how a mock draft was run. Superseded
    08/25/26 by LOAD KEEPERS, above — see the bullet at the top of this section.

- **Published** (08/24/26): <https://github.com/james-corr/e3draft>, public. Two things were
  removed from history first, and both are worth knowing about if the repo is ever rebuilt:
  - Both 2025 `.xlsx` workbooks. `JPC USE - Draft 2025 - in use.xlsx` has two live Google
    Sheets URLs embedded in its sheets. They stay on disk and are now gitignored — the
    migration off them (`tools/extract_from_xlsx.py`) was finished long ago.
  - The publish handoff itself. `plans/archive/08_18_26_setup-editor-and-github_handoff.md`
    quoted one of those URLs in full while explaining why the workbooks had to go, and carried
    the grep to prove it was gone. Redacted across every revision.

  `config.json` (the Fantasy Footballers login) has never been committed. `scoring/` went
  public as cleared on 08/23/26. History was rewritten, so pre-08/24/26 commit hashes changed.

- **The app is the board** (08/24/26): the shared Google Sheet is gone — no co-edited board this
  season, no Sheets API, no API key. James types every pick in. Everything that followed from
  that landed together:
  - The pick box moved under the top rail and grew a **type-ahead**: arrow keys navigate, enter
    takes the highlighted match or the first one if you haven't moved. `public/combobox.js`.
  - **One-click drafting** from any ON THE BOARD row, consuming whatever pick is next.
  - A **duplicate pick is recorded and reported**, naming where that player already went.
  - **Plans edited in place** on FIELD — click a plan's name or any target. Same matcher, same
    `.bak`-backed save as the setup surface.
  - **Team names, draft order, and "which seat is mine"** editable on the BOARD screen.
    Reordering moves each team's picks with them. `POST /api/league`.
  - **CLEAR BOARD** wipes every pick, which is also how a mock draft is now run.
  - **Round notes** moved off the board grid into their own scrolling panel on FIELD.

- **Mock drafts** (08/23/26): the in-app pick entry strip that made all of the above possible.
  Superseded by the entry above — there is no mock mode any more, because there is no other
  mode to distinguish it from.

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
- Live plumbing: change-detecting poll loop, SSE push (the Google Sheets read path and
  `tools/make-board-tab.mjs` were deleted 08/24/26 along with the shared board)
- Migration off the old workbooks (`tools/extract_from_xlsx.py`): 676 players, 9 contingency plans, 10 round notes, 2025 draft as a test fixture
