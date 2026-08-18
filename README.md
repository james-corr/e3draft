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
| `Esc` | Close whichever card is open |

SUN is the default because the draft happens outdoors on a laptop in bright daylight. NIGHT is
there for anywhere darker. The choice is remembered.

Click the bracket icon on any player to lock them as a target; they show up under TARGET. Click
the player's **name** instead and a focus card opens with everything known about him, plus the
watch tags and a place to write why he's on your list.

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
- **The cue strip** (just under the top rail) — your own note for the round in play, or the next
  one coming. These are the margin notes from the old sheet: when the kicker run starts, where
  the RB deadzone is. Every one of them also sits on its own round in the BOARD view.
- **The watchlist chips** (under the position filter) — LOCKED plus whichever tags you've used.
  Click one to narrow the board to just those players; click it again to clear. The count is how
  many are still available, so a chip always promises what it shows.

## Watch tags

Five tags, carried over from the old sheet: **Breakout**, **Sleepers**, **Busts**, **Late Round
Fliers**, **My Guys**. A tag and a lock are one record — a lock says *I want him*, a tag says
*why* — so both are set from the same focus card, and both survive the yearly refresh.

## Setup: writing the plans and notes

Click the setup icon in the **PLANS** header. That opens the prep surface, where the contingency
plans and round notes are edited directly — no JSON, no spreadsheet.

- Name fields autocomplete against the real player pool.
- Every target is checked against **the same matcher that reads the board on draft day**. A row
  showing `WR · CIN` will be found; a row showing `NO MATCH — Bijan Robinson?` is a typo waiting
  to happen. A row that matches nothing and looks nothing like anybody is treated as what it
  usually is — a written reminder like `CHECK LATE ROUNDERS` — and marked `NOTE` rather than
  flagged.
- Wrap a note line in `***asterisks***` to make it shout on the cue strip.
- Nothing is written until **SAVE**. The previous version is always kept beside it as
  `data/branches.<year>.json.bak`, and rows missing a round or a name are dropped with a count
  reported back rather than vanishing quietly.

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
2. Pull this year's rankings — **REFRESH FROM UDK** in **setup**, or `npm run refresh` in a
   terminal. Both do the same thing: log into thefantasyfootballers.com and rewrite
   `data/players.<year>.json`. See "Refreshing the rankings" below.
3. Point the app at the new season: set `"season"` in `config.json`.
4. Rewrite the plans and round notes in **setup** (the icon in the PLANS header).
5. Clear the board tab and pre-fill any keepers.

No formulas to rewire, because there are no formulas.

## Refreshing the rankings

One-time setup: `npm run set-login`. It asks for your thefantasyfootballers.com email and
password, checks them against the site, and saves them to `config.json` — which is gitignored, so
they never leave this machine.

Then, any time you want today's numbers:

```
npm run refresh              # pull and write
npm run refresh -- --dry-run # pull and check, write nothing
```

or press **REFRESH FROM UDK** in the setup panel. It takes a few seconds.

**It will not overwrite good data with a bad pull.** Every position has to come back with a
sensible number of players, the total has to be in the same league as what it replaces, ids have
to be unique, and the numbers have to be numbers. If anything fails it names the check, leaves
the existing file exactly as it was, and keeps the raw pull under `data/raw/<date>/` so you can
see what came back.

Two things worth knowing:

- **The UDK ranks no IDP.** No LB, DE, S, DT or CB — so this pull alone cannot fill a pool for a
  league that starts them. FantasyPros is still needed for that half, and is not automated yet.
  The refresh says so every time it runs.
- **Rankings depend on scoring.** The UDK publishes six different ranking sets. Yours is
  `HALF (6pt QB)`, set in `config.json`. Change the league's scoring and change that too, or the
  rankings will be quietly answering a different question than the one you're asking.

If Fantasy Footballers change their site, run `npm run recon` — it checks each piece the pull
depends on and prints which one moved.

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
| `lib/store.js` | Saves the watchlist and the plans to disk, atomically |
| `public/app.js` | The viewfinder: renders whatever state the server sends |
| `public/setup.js` | The prep surface: editing plans and round notes |
| `public/` | The interface |
| `data/` | Players, league config, contingency plans, saved targets |
| `tools/` | The xlsx migration and the board-tab generator |
| `plans/` | Design and build plans |

## Testing without the sheet

`config.json` accepts `"localLimit": <n>` to replay the 2025 fixture partway, so you can see a
realistic mid-draft state. `51` puts you six picks away from being on the clock in round 5.

Adding `?static=1` to the URL renders one snapshot without opening the live stream — useful for
screenshots and debugging. The URL also takes `?view=grid|field|player`, `?exposure=sun|night`,
`?focus=<player id>` and `?setup=1`, so any particular screen can be linked to directly.
