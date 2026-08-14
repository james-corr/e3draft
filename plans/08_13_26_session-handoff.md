---
Date last edited: 08_13_26
Date created: 08_13_26
---

# e3draft — session handoff (continue here in a new session)

James is continuing this project in a new session after this document. Read this in full before
doing anything — it captures decisions made and structural findings from reviewing the actual
.xlsx files that aren't written down anywhere else yet. Also read `../CONTEXT.md` (kept current)
and `08_13_26_initial-build_plan.md` in this same folder (the draft plan written before the
findings below — some of it is now superseded, noted inline).

## The project, one paragraph

James runs a fantasy football league draft using two linked Google Sheets: a shared board
("E3 Draft 2025") his leaguemates enter picks into live, and a personal "command center"
("JPC USE - Draft 2025 - in use") that reads the board live and gives James decision support
(who's taken, tiers remaining, targets) during the draft. Both have grown complicated over years
and take 1-2 hours to refresh before each draft. Goal: rebuild both so refreshing next year is
fast, and the command center hits a **1-3 second** live-update speed the current Sheets-based
version can't reliably hit.

## Decisions locked in so far

1. **Shared board stays a Google Sheet** (leaguemates need to co-edit it live). Non-negotiable.
2. **Command center becomes a local app**, not a Sheet — small local server + browser tab, same
   pattern as `../../thursday/` (James's other personal tool) so he has one consistent way of
   running things. It reads the shared board's live picks and does all "who's taken / tier counts
   / targets" logic in memory instead of through chained spreadsheet formulas — this is how it
   hits the 1-3 second target that IMPORTRANGE + formula-chain recalculation currently can't.
3. **Live connection: a Google Cloud API key**, read-only, against the board shared as "anyone
   with the link can view." James confirmed he's fine doing this one-time setup (~5 min); walk him
   through every screen when the time comes. No OAuth login flow needed at draft time.
4. **Keepers are a real league rule.** (Previously unconfirmed — the `Draft position numbers w
   Keeper` tab is real and used, not legacy cruft.)
5. **League scoring and settings are not documented anywhere in either file.** James wants them
   written down properly as part of this rebuild (not found during the file review — this is new
   work, not a transcription task). Need to get this from James directly: scoring system (PPR /
   half-PPR / standard, position-specific modifiers), roster construction, keeper rules
   (how many, cost, eligibility), draft format (snake/auction/etc — file structure implies snake).
6. **Data sources confirmed correct as-is:** FantasyPros consensus cheat sheet = base player list,
   enriched with Fantasy Footballers (FFB) rankings via lookup. James's earlier mention of "PFF"
   was a misnomer for FantasyPros — nothing is missing.
7. **`BOARD 2025` tab (command center file) is priority #1 for fidelity.** James's exact words:
   "that's where I spent almost ALL of my time during the draft so everything there is what I
   want rebuilt." See the detailed breakdown below — this tab is much more than a simple grid.
8. **New feature requested: a "Player Inventory" tab**, separate from the draft-day tab, where
   James can "star" a player to mark them as a target. This is in addition to (not a replacement
   for) the existing round-by-round target-planning grid described below, which James also wants
   kept — he called it "really important."
9. **Confirmed OK to drop as dead weight:** `Mocks`, `Best Left Charts` (the *tab* — empty, not to
   be confused with the "Best Left" board described below which is real and lives inside
   `BOARD 2025` itself), `BOARD 2024 - filled in`, `Top Off 2024`, `PositionADP 2025`'s "Planning"
   column, `2025 setup`, and the four dated `FFB_Raw`/`FFB_Polished` data-dump tabs.
10. **Phase 2, explicitly deferred, do not build yet:** ingest ~30-50 Fantasy Footballers Podcast
    episode transcripts, atomize them, and let James query them via an LLM layered over the
    transcripts + rankings data, for draft-prep research. Keep this in mind as a "don't paint
    ourselves into a corner" consideration when picking the local app's data storage approach
    (e.g. plain files/SQLite over something that'd fight a future RAG layer), but do not scope or
    build it now.

## Detailed structure of `BOARD 2025` (command center file) — read before rebuilding

This tab is one sheet doing five distinct jobs stacked on top of each other. Row/column refs below
are from `JPC USE - Draft 2025 - in use.xlsx`, sheet `BOARD 2025` (dims A1:BD275).

### 1. The draft grid itself (rows 1-45, columns A-O)
- Row 1 imports team names from the shared board via `IMPORTRANGE`; rows 2-19+ hold the picks
  (player name + position/team/bye, newline-separated in one cell), imported the same way.
  Snake-draft direction arrows (`→`/`←`) in column O.
- This is what's actually live-fed from the shared board today (the IMPORTRANGE call is the
  bottleneck — see `../CONTEXT.md` for the diagnosis).

### 2. Live summary panel (rows 47-55)
- **"Live Picks By POS"** (B47 header): a team-by-team, position-by-position count of players
  drafted so far (e.g. row 49 = RB counts per team, including a league-wide total in B49).
- **"On Deck Player Analysis"** (R47 header, columns R-AA): a rolling log of recently-picked
  players with their FFB ADP/Tier/Risk/Upside pulled in via lookup — looks like "what just got
  taken and how good was it" context.
- **"My Team"** (AC47 header): James's own roster position counts.

### 3. Round-by-round target planning grid (rows 25-43+, columns R through BD) — "really important"
This is the piece James specifically flagged as important and wants preserved. It is **not** a
simple target list — it's a branching, round-by-round draft strategy tool:
- Column **R** holds free-text strategy notes tied to specific rows, e.g. `"23 - TE1 & TE2 gone,
  QB1 gone"`, `"TE3 / ***RB deadzone begin***"`, `"23 - Defense run starting soon.."`,
  `"23 - IDP!!! / LB / S FIRST"`. These read like conditional triggers/reminders James wrote for
  himself during past drafts — "once X has happened, pivot to Y."
- The grid is structured in repeating 4-column blocks: a name column (e.g. `V`) where James types
  a targeted player, a status column (e.g. `U`) with `=VLOOKUP(V26, 'Data Import'!$R$3:$U$824, 4,
  FALSE)` that returns live TAKEN / NOT TAKEN, and an array-formula column (e.g. `X`) that resolves
  to the round.pick number where that player actually got drafted once taken (e.g. `3.11` = round
  3, pick 11) — so James can see at a glance not just "is my target gone" but "when did it go."
  This pattern repeats across column blocks `U/V/X`, `Y/Z/AB`, `AC/AD/AF`, `AG/AH/AJ`, `AK/AL/AN`,
  and continues further right to `AO`, `AS`, `AW`, `BA` (row 25 header labels there read
  `"RB RB > WR WR WR"`, `"WR > RB"`, `"RB > WR"`, `"RB > WR > TE"`).
- **Interpretation, not yet confirmed with James:** each column-block is a separate contingency
  plan/strategy branch (e.g. "if the draft goes RB-heavy, here's my target queue" vs. "if it goes
  WR-heavy..."), each with its own round-by-round ranked list of targets and live taken/available
  status. **Confirm this reading with James before rebuilding it** — get him to walk through what
  the columns mean in his own words, ideally live, rather than guessing further from the file.
- Conditional formatting color-codes these cells by position (RB/QB/TE/WR/DST/K/LB/S/DE/DT/CB
  substring matches) and flags TAKEN vs NOT TAKEN distinctly.

### 4. The "Best Left" board (rows 82-275+, columns A-V) — the thing James asked about by name
Found it — it's real, and it's not a chart object (checked; zero embedded charts/images in this
sheet). It's a large conditionally-formatted table of the **remaining draft-eligible player pool**,
laid out in position-grouped column triples: `QB / Pros Tier / FFB Tier`, `RB / Pros Tier /
FFB Tier`, `WR / Pros Tier / FFB Tier`, `TE / Pros Tier / FFB Tier`, `DEF / Pros Tier / FFB Rank`,
`K / Pros Tier / FFB Rank`, `IDP / POS_# / Rank`. Conditional formatting color-codes each cell by
its tier digit (1-9, A, 10, 11), so glancing at the block shows tier clusters visually — this is
the "chart" James remembers, it's a color-coded grid, not a literal chart object.
- Next to it (starting ~column X, row 82) is a second small tagged-notes list — headers `Breakout`,
  `Sleepers`, `Busts`, `Late Round Fliers`, `My Guys` — with a `Type / POS / Name / Notes / FFB ADP`
  table structure starting around row 91. This looks like James's own annotated watch-list
  layered on top of the rankings (separate from, but related to, the new "Player Inventory /
  star a target" feature he's requesting — worth reconciling the two rather than building
  duplicate mechanisms).

### 5. Known dangling reference (informational, not urgent)
The hidden `OLD DB, USED FOR VIZ DNT DLT` tab (in both files) has a formula referencing
`Misc!W25` — there is no `Misc` tab in either workbook. It's a broken/orphaned reference from a
tab that no longer exists, wrapped in `IFERROR` so it fails silently. Not worth chasing; it's moot
once this tab is retired in the rebuild, just flagging so it isn't mistaken for something to port
forward.

## Open questions to resolve with James before/while building

1. Walk through the round-by-round target grid (section 3 above) together — confirm the
   column-block = strategy-branch interpretation, and how James actually wants to interact with it
   day-of (does he pre-fill targets before the draft, or edit live as picks happen, or both?).
2. Get league scoring/settings from James directly (see point 5 above) — this needs to be
   documented as part of this project, not inferred from the files (it isn't in them).
3. Reconcile the "Best Left" board's `Breakout/Sleepers/Busts/Late Round Fliers/My Guys` tag list
   with the newly-requested "Player Inventory / star a target" feature — are these the same idea
   James wants unified, or genuinely separate (tags = pre-draft research notes, stars = active
   in-draft targeting)?
4. Confirm keeper mechanics in detail (count, cost/penalty, eligibility rules) — needed for both
   the shared board (pre-filled keeper picks) and any roster-construction logic in the app.

## Where things stand procedurally

- `plans/08_13_26_initial-build_plan.md` is the draft plan written *before* these detailed
  findings — its high-level direction (local app, API key, big simplification of the shared board)
  still holds, but its "proposed pieces" section undersells the target-planning grid's complexity
  and should be revised once the open questions above are answered. **Do not start building code
  yet** — per `builds/CONTEXT.md`, plans get discussed before builds, and this one still has real
  open questions.
- `../CONTEXT.md` has the running project summary — keep it current as decisions get made; this
  handoff doc is a point-in-time snapshot, `CONTEXT.md` is the source of truth going forward.

## How to re-inspect the source files yourself

The two source files (`E3 Draft 2025.xlsx`, `JPC USE - Draft 2025 - in use.xlsx`) are in this
project folder. To read formulas (not just values) out of them, `openpyxl` is required and was
not present in the system Python — it was installed into a throwaway venv under the previous
session's job tmp dir, which will not persist. To redo this in a new session:

```bash
python3 -m venv /tmp/e3draft_venv   # or any scratch location
/tmp/e3draft_venv/bin/pip install --quiet openpyxl
/tmp/e3draft_venv/bin/python - <<'EOF'
import openpyxl
wb = openpyxl.load_workbook("JPC USE - Draft 2025 - in use.xlsx", data_only=False)  # formulas
# wb = openpyxl.load_workbook(path, data_only=True)  # last-calculated values instead
for name in wb.sheetnames:
    print(name, wb[name].dimensions)
EOF
```

Note: name any inspection script something other than `inspect.py` — that filename shadows
Python's stdlib `inspect` module, which `openpyxl` itself imports internally, and causes a
circular-import crash. (Cost real time working this out — worth not repeating.)
