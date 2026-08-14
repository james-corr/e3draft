# E3 Draft — Command Center

James's fantasy football draft command center. Reads the league's shared Google Sheet board
live and does every taken/available/tier calculation locally.

Replaces a 22-tab Google Sheet that took one to two hours to rebuild each year and could not
keep up during the draft. A full recompute now measures **1.75ms** against a 1–3 second target,
so the only real cost is the network round-trip to Google.

## Running it

Double-click **`Start Draft.command`**, or:

```bash
npm start
```

Then open <http://localhost:4173>.

There is nothing to install — no dependencies, no build step. Node 18 or newer.

## Draft-day controls

| Key | Does |
|---|---|
| `1` / `2` / `3` | Frame wide (the 20×12 board), field (the working view), or tight (your targets) |
| `E` | Switch exposure between SUN and NIGHT |

SUN is the default because the draft happens outdoors on a laptop in bright daylight. NIGHT is
there for anywhere darker. The choice is remembered.

Click the bracket icon on any player to lock them as a target; they show up under TARGET.

## Reading the screen

- **REC lamp** (top left) — the live connection. Pulsing means picks are flowing. `HOLD` means
  the stream dropped and is reconnecting. `NO SIG` means the sheet can't be read at all.
- **CHECK SHEET** — a zebra-striped band appears when someone typed a name the app can't match.
  It names the pick and suggests a correction. **This is the one thing to never ignore**: an
  unmatched pick means a drafted player is still showing as available.
- **Tier bands** — each position's best remaining tier shows how many are left. When it drops to
  three or fewer it goes amber with zebra stripes. That's the cliff.
- **PLANS** — your contingency branches. The meter is how much of that plan is still on the
  board, so you can see at a glance which strategy the draft has left intact. Struck-through
  names show the round.pick where they actually went.

## One-time setup: connecting the live board

Until this is done the app runs off `data/board.local.json` (the 2025 draft, as a test fixture),
so you can click around now and it will behave exactly as it will on the day.

**1. Add the board tab to the shared sheet.**

```bash
node tools/make-board-tab.mjs
```

Then in the existing E3 Draft sheet: *File → Import → Upload*, pick `out/DRAFT BOARD.csv`, and
choose **Insert new sheet(s)** — not "replace spreadsheet". Rename the new tab to exactly
`DRAFT BOARD` and freeze row 1 and column A.

Tell your leaguemates: **type the player's name only.** No position, no team, no bye week — the
app fills all of that in. Names are matched loosely (`D.K. Metcalf`, `DK Metcalf`, and
`dk metcalf` all work), and anything that doesn't match gets flagged on screen rather than
silently dropped.

**2. Share the sheet as link-viewable.** *Share → General access → Anyone with the link →
Viewer.* Editing stays restricted to whoever it is now; the app only ever reads.

**3. Get a Google API key.** At <https://console.cloud.google.com>: create a project, then
*APIs & Services → Library →* enable **Google Sheets API**, then *Credentials → Create
credentials → API key*. Restrict it to the Sheets API. Takes about five minutes.

**4. Point the app at the board.**

```bash
cp config.example.json config.json
```

Fill in `sheetId` (the long string in the sheet's URL between `/d/` and `/edit`), `apiKey`, and
set `"source": "sheet"`.

`config.json` is gitignored. The key never gets committed.

## The yearly refresh

This is the part that used to take an afternoon.

1. Update team names and draft order in `data/league.json`.
2. Drop in this year's FantasyPros consensus cheat sheet and Fantasy Footballers rankings as
   `data/players.<year>.json` (see `tools/extract_from_xlsx.py` for the shape).
3. Clear the board tab and pre-fill any keepers.

No formulas to rewire, because there are no formulas.

## How it fits together

```
shared Google Sheet          this app
┌──────────────────┐         ┌────────────────────────────────┐
│  DRAFT BOARD tab │ ──API──▶│ lib/board.js    reads the grid │
│  names only,     │  read   │ lib/players.js  matches names  │
│  no formulas     │  only   │ lib/state.js    the whole      │
└──────────────────┘         │                 engine, 1.75ms │
        ▲                    │ server.js       polls + pushes │
        │                    └───────────┬────────────────────┘
   leaguemates                           │ SSE
   type picks                            ▼
                                   browser tab
```

The server polls the sheet, recomputes only when the board actually changed, and pushes the new
state to the browser over Server-Sent Events. The client never calculates anything — it only
frames what it is handed.

## Layout

| Path | What |
|---|---|
| `server.js` | HTTP server, poll loop, SSE |
| `lib/state.js` | The engine: taken/available, tiers, rosters, plan health |
| `lib/players.js` | Player pool and the name matcher |
| `lib/board.js` | Reads the sheet (or the local fixture) |
| `lib/store.js` | Saves stars/tags to disk, atomically |
| `public/` | The interface |
| `data/` | Players, league config, contingency plans, saved targets |
| `tools/` | The xlsx migration and the board-tab generator |
| `plans/` | Design and build plans |

## Testing without the sheet

`config.json` accepts `"localLimit": <n>` to replay the 2025 fixture partway, so you can see a
realistic mid-draft state. `51` puts you six picks away from being on the clock in round 5.

Adding `?static=1` to the URL renders one snapshot without opening the live stream — useful for
screenshots and debugging.
