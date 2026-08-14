---
Date last edited: 08_13_26
Date created: 08_13_26
---

# e3draft — initial build plan (draft, not yet discussed with James)

## Recap of the decision so far

- Shared board stays a Google Sheet (leaguemates need to enter picks live). Name: "E3 Draft 2025".
- Command center becomes a **local app** (name TBD, "JPC USE - Draft 2025 - in use" is a leftover
  name). It reads picks from the shared board and needs to update in **1-3 seconds**.
- Live connection: a **Google Cloud API key**, read-only, against a board shared as "anyone with
  the link can view." No OAuth login flow needed at draft time.
- Data sources: FantasyPros consensus cheat sheet (base player list) enriched with Fantasy
  Footballers rankings (tier/risk/ADP/position rank/upside) — both already accounted for in the
  current file, just merged by hand today.

## The big simplification this unlocks

Today, **both** files carry a full copy of the "who's taken, what tier is who in" engine — the
824-row player import, the 1,700-row availability table, VLOOKUPs into Fantasy Footballers data,
7 per-position filtered views. That's the actual source of the complexity and the annual rebuild
pain.

Once the command center is an app instead of a Sheet, **none of that logic needs to live in a
spreadsheet at all.** The app owns it — reads the picks, does the lookups and tier math in memory
(instant, not formula-chain-instant), and renders the views. That means:

- **The shared board gets radically simpler.** It only needs to be the picks grid your leaguemates
  fill in — probably one tab, no hidden engine underneath it. Nothing left for it to secretly
  compute.
- **The command center Google Sheet goes away entirely**, replaced by the app.
- **Year to year, there's one clear refresh step**: drop in this year's FantasyPros export and
  Fantasy Footballers export, update the roster of who's in the league and draft order, done. No
  more re-wiring 20 tabs of formulas across two files.

## Proposed pieces

1. **Rebuilt shared board (Google Sheet)** — just the picks grid (team names across the top, pick
   order down the side, cell = player picked). Maybe a small "draft settings" area (draft order,
   keeper info if that's real — need to confirm keepers are a real league rule, saw a "Draft
   position numbers w Keeper" tab but haven't confirmed it's used). This is what gets shared with
   leaguemates.

2. **Local command center app** — small local server + browser tab, same pattern as the
   `../thursday/` project (so James has one consistent way of running his personal tools, not a
   different setup every time). On draft day: James opens one thing, it's a page in his browser,
   no install step.
   - Polls the shared board via the Google Sheets API (API key) every 1-2 seconds for new picks.
   - Loads this year's FantasyPros + Fantasy Footballers data from local files (see refresh
     workflow below) — merged once at startup, not re-computed via spreadsheet formulas.
   - Recreates the views James actually uses. **Draft assumption below — confirm before building:**
     - Available players, filterable by position (replaces `QBs_avail`, `RBs_avail`, etc.)
     - Tier counts remaining per position (the "how many Tier 2 RBs are left" question)
     - On Deck / My Team view (who's on James's roster so far)
     - Targets list (players James is watching)
   - **Assumed cut, confirm before dropping:** `Mocks` tab, `PositionADP 2025`'s "Planning"
     column, `Best Left Charts` (empty already), all of `BOARD 2024 - filled in` / `Top Off 2024`
     (prior season, not needed live). These look like exploration/history, not live-draft tools —
     but James should confirm before they're left out of the rebuild.

3. **One-time setup (before draft day, done once):**
   - James creates a Google Cloud API key (I'll walk through every screen).
   - Shared board's sharing set to "anyone with the link can view" (read-only is enough for the
     app; editing still restricted to leaguemates as it is today).
   - App configured with the key + the board's sheet ID.

4. **Yearly refresh workflow (the part that currently takes 1-2 hours):**
   - Update team/owner names and draft order in the shared board.
   - Paste this year's FantasyPros cheat-sheet export and Fantasy Footballers export into two
     input files the app reads (same manual copy/paste James already does today — not
     automating the pull from those sites, just no longer re-wiring formulas after pasting).
   - Confirm keeper picks if applicable, pre-fill them into the board.
   - That's it — no formula rewiring, because the logic lives in the app, not the sheet.

## Open questions for James before this plan is final

1. Are keepers a real league rule? (`Draft position numbers w Keeper` tab exists but unconfirmed.)
2. Confirm the views list above — anything missing, anything to drop.
3. Confirm the "assumed cut" tabs above are actually unused now.
4. Any preference on how "targets" get entered/tracked in the new app (today it's not obviously
   automated in either file — worth understanding how James currently marks a target).

## Explicitly not doing

- Not building anything until this plan is discussed and confirmed.
- Not automating the FantasyPros/Fantasy Footballers data pull (scraping their sites) — staying
  with manual copy/paste like today, just removing the formula-rewiring pain after the paste.
- Not touching the "possible bug" found in `Available vs. Taken` (mismatched row-2 reference) —
  moot once that tab is retired in favor of the app doing the check directly, but flagged in case
  it explains a past-year discrepancy James remembers.
