# E3 Draft — Command Center

James's fantasy football draft command center. Every pick is typed into this app, and it does
every taken/available/tier calculation locally.

Replaces a 22-tab Google Sheet that took one to two hours to rebuild each year and could not
keep up during the draft. A full recompute measures **1.75ms** against a 1–3 second target, and
there is no network in the loop at all — the board is a file on this machine.

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
the record mark beside it to mark him drafted. Click the player's **name** instead and a focus
card opens with everything known about him, plus the watch tags and a place to write why he's on
your list.

## Reading the screen

- **REC lamp** (top left) — recording. `HOLD` means the browser's stream dropped and is
  reconnecting. `NO SIG` means the board file can't be read at all. `REPLAY` means the app is
  pointed at the 2025 fixture rather than this year's board.
- **CHECK SHEET** — a zebra-striped band appears when a name on the board can't be matched.
  It names the pick and suggests a correction. **This is the one thing to never ignore**: an
  unmatched pick means a drafted player is still showing as available.
- **Tier bands** — each position's best remaining tier shows how many are left. When it drops to
  three or fewer it goes amber with zebra stripes. That's the cliff.
- **PLANS** — your contingency branches. The meter is how much of that plan is still on the
  board, so you can see at a glance which strategy the draft has left intact. Struck-through
  names show the round.pick where they actually went.
- **The cue strip** (just under the pick box) — your own note for the round in play, or the
  next one coming. These are the margin notes from the old sheet: when the kicker run starts,
  where the RB deadzone is.
- **ROUND NOTES** (top of the right column on FIELD) — the whole run of those notes, scrolling.
  The round in play is marked and the rounds behind you are struck through, so reading ahead
  costs nothing.
- **The watchlist chips** (under the position filter) — LOCKED plus whichever tags you've used.
  Click one to narrow the board to just those players; click it again to clear. The count is how
  many are still available, so a chip always promises what it shows.

## Watch tags

Five tags, carried over from the old sheet: **Breakout**, **Sleepers**, **Busts**, **Late Round
Fliers**, **My Guys**. A tag and a lock are one record — a lock says *I want him*, a tag says
*why* — so both are set from the same focus card, and both survive the yearly refresh.

## Setup: writing the plans and notes

Plans can be edited straight from the FIELD screen: click a plan's name to rename it, or any
target's name to swap in a different player — the same type-ahead as the pick box. Both save
immediately.

Adding and removing rows lives in the prep surface, behind the setup icon in the **PLANS**
header, where the contingency plans and round notes are edited in bulk — no JSON, no
spreadsheet.

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

## Entering picks

Every pick in the draft comes through this app. There are two ways in, and both do exactly the
same thing:

**The pick box**, under the top rail on every screen. Type who just went, press enter. It
tells you who is on the clock so you always know whose pick you're typing.

- **Type-ahead.** Start typing and a list of matching players drops down. Arrow keys move
  through it; **enter takes the highlighted one, or the first one if you haven't touched an
  arrow key**. Players already off the board are shown struck through and marked GONE.
- It echoes who the name actually resolved to. `dk metcalf` landing on DK Metcalf is how you
  learn to trust the matcher before it matters.
- A name it cannot place is still recorded, and shows up as an unmatched pick under CHECK
  SHEET. It is never rejected — a refused pick is a pick you think you made and didn't.
- A player entered twice is also recorded, but the echo says loudly where he already went.
- **UNDO** takes back the last pick.

**The take button** on any row in ON THE BOARD — the small record mark on the right of the
row. One click marks that player drafted at whatever pick is next. No confirmation: UNDO is
right there, and a dialog on every one of 240 picks costs more than the occasional mis-click.

Picks are written to `data/board.<season>.json`.

## The BOARD screen

**TEAMS** turns the header row into fields. Rename anyone, use ◀ ▶ to change the draft order,
and **YOU** marks which column is yours. Nothing is written until SAVE.

Reordering moves each team's picks with them — a manager keeps everyone they've already taken
and only their place in the snake changes. If there are picks on the board it asks first,
because that re-cuts the whole snake from that point on.

**CLEAR BOARD** wipes every pick. That is also how you rehearse: clear, run a mock draft
through the same screens you'll use on the day, clear again.

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
                    ┌────────────────────────────────┐
   you type    ──▶  │ server.js       writes the grid│
   a pick           │ lib/picks.js    board.<yr>.json│
                    │ lib/board.js    reads it back  │
                    │ lib/players.js  matches names  │
                    │ lib/state.js    the whole      │
                    │                 engine, 1.75ms │
                    └───────────┬────────────────────┘
                                │ SSE
                                ▼
                          browser tab
```

Every pick lands in `data/board.<season>.json`, is read back through the same matcher and
engine, and the new state is pushed to the browser over Server-Sent Events. The client never
calculates anything — it only frames what it is handed.

There is no shared board and no network hop. It was a Google Sheet the leaguemates co-edited
in 2025; this year James types every pick himself, so the app owns the board outright.

## Layout

| Path | What |
|---|---|
| `server.js` | HTTP server, poll loop, SSE |
| `lib/state.js` | The engine: taken/available, tiers, rosters, plan health |
| `lib/players.js` | Player pool and the name matcher |
| `lib/board.js` | Reads the board grid (this year's, or the 2025 fixture) |
| `lib/picks.js` | Writes it: picks, undo, clear, team order |
| `lib/store.js` | Saves the watchlist, the plans and the league to disk, atomically |
| `public/app.js` | The viewfinder: renders whatever state the server sends |
| `public/combobox.js` | The name type-ahead, shared by the pick box and the plans |
| `public/setup.js` | The prep surface: editing plans and round notes |
| `public/` | The interface |
| `data/` | Players, league config, the board, contingency plans, saved targets |
| `tools/` | The xlsx migration and the rankings ingest |
| `plans/` | Design and build plans |

## Testing against the 2025 draft

Set `"source": "local"` in `config.json` to replay `data/board.local.json`, the complete 2025
draft kept as a fixture. `"localLimit": <n>` stops it partway, so you can see a realistic
mid-draft state — `51` puts you six picks away from being on the clock in round 5. The board is
read-only in this mode: the pick box is hidden and the server refuses to write.

Adding `?static=1` to the URL renders one snapshot without opening the live stream — useful for
screenshots and debugging. The URL also takes `?view=grid|field|player`, `?exposure=sun|night`,
`?focus=<player id>` and `?setup=1`, so any particular screen can be linked to directly.
