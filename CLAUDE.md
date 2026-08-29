# e3draft — working rules

Read `PRODUCT.md` for product truth, `ROADMAP.md` for state, `README.md` for how to run it.
Plans live in `plans/`. This file is the house rules.

## What this is

James's fantasy football draft command center. This app IS the board: James types every pick
into it and it does all the thinking. See `PRODUCT.md`.

It was built around a shared Google Sheet the leaguemates co-edited. That is gone as of
08/24/26 — no shared board this year, no Sheets API, no second source of truth. If you find a
comment or a doc that still says otherwise, it is stale; fix it.

## The rules that matter

1. **Never let a pick fail silently.** If a typed name can't be matched, it must appear on
   screen as an unmatched pick. A drafted player shown as available costs James a pick, and it
   is the only failure in this app that is genuinely expensive. Do not "helpfully" fuzzy-match
   your way past ambiguity — `lib/players.js` deliberately refuses to guess between two players
   with the same surname. The same reasoning makes a pick never *refused*: `addPick` records an
   unmatched name, and a duplicate is recorded and reported rather than blocked.

2. **The board file stays dumb.** `data/board.<season>.json` is a grid of typed names and
   nothing else. Every calculation belongs in `lib/state.js`. The old setup put the engine in a
   spreadsheet and that is precisely what made it too slow and too fragile. Team names come
   from `league.json`, never from the grid's row 0 — one owner for who drafts where.

3. **Speed budget is 1–3 seconds end to end.** Local recompute is ~1.75ms and there is no
   network in the loop at all, so this is now met with enormous margin. Don't spend it: the
   server ships whole computed states and the client only frames them.

4. **James is not a developer.** Explain trade-offs in plain terms and give a recommendation.

5. **Don't invent league facts.** Scoring, roster slots, and keeper rules came from James
   directly and live in `PRODUCT.md`. The keeper round-cost never needed deciding: keepers are
   typed into the cell for the manager and round they cost, so the round is entered, not
   inferred. Don't build a rule for it now.

6. **A star and a tag are one record.** The watchlist and the "star a target" idea were the same
   thing in the old workbook and are one inventory entry here: `{ starred, tags, note }` per player.
   Don't build a second mechanism beside it.

7. **The plans are the real asset.** `data/branches.<year>.json` holds years of accumulated
   judgment that cannot be reconstructed from the board or the exports. Every write goes through
   `validatePlan` and leaves a `.bak`, and anything the save drops is reported back to the screen.

8. **Two-way players are one human.** A player listed at two positions holds two rows on
   purpose (Travis Hunter is a WR and a CB). Drafting him must take every row. Keys are
   `name|position`, and taken-status is tracked by normalized name.

## Design

The visual world is a **camcorder viewfinder OSD**, chosen by James over the roll's assigned
direction. The direction contract is the first comment in `public/index.html` — read it before
touching the interface, and keep it accurate.

- Instrument rails are the camera body and stay letterbox black in both exposures. The scene
  between them re-exposes: **SUN** (bright field, dark OSD ink) is the default because the draft
  is outdoors on a laptop; **NIGHT** is the world as it ships.
- Amber `#FFB000` is caution only — scarcity, on-the-clock, live and locked targets. Not decoration.
  Every other emphasis — a pressed watchlist filter, a taken status, the primary SAVE — is solid ink.
- 45° zebra is the blown-highlight warning: unmatched picks and the tier cliff. Nothing else.
- Corner brackets frame every region. The closed bracket pair means a locked target.
- No information by color alone — sunlight legibility is a stated accessibility requirement.
- DSEG14 draws digits well and letters badly. `seg()` in `public/util.js` decides; alphanumeric
  values like `WR29` stay in the UI face. The tape-counter labels (`R05:P04`) are the exception.
- Overlays occlude with the letterbox scrim rather than lifting — the system has no shadow token.
- Design review is **on** for this project (`.impeccable/config.json`). It was off when this was
  assumed to be spreadsheets-only.

## Conventions

- Zero dependencies, ESM, no build step. Node 18+. Same shape as `../thursday/`.
- `config.json` holds the API key and is gitignored. Never open, print, or commit it.
- Data files are per-season (`players.2025.json`, `branches.2025.json`) so a new year is a new
  file rather than an edit.
- Writes go through temp-file + rename (`lib/store.js`). An interrupted save must never corrupt
  the inventory an hour before the draft.
- Don't name an inspection script `inspect.py` — it shadows the stdlib module `openpyxl`
  imports internally and crashes with a circular import.

## Testing

`config.json` takes two sources. The default writes and reads `data/board.<season>.json` with
the pick box on (`lib/picks.js`, `/api/board/*`) — that is the real board. `"local"` plus
`"localLimit": <n>` replays the 2025 draft partway from `data/board.local.json`; the board is
read-only there and the server refuses `/api/board/*`, because that fixture is the only replay
we have and nothing may overwrite it.

A mock draft is now just a draft: clear the board, run it, clear it again.

`?static=1` on the URL renders one snapshot instead of opening the SSE stream, which is
how headless screenshots are taken — the live page never finishes loading, so capture hangs
without it. `?view=`, `?exposure=`, `?focus=<player id>` and `?setup=1` deep-link any screen.

**Never launch a headless instance of James's Brave or Chrome.** Two instances of the same
macOS browser bundle fight over shared system graphics/IPC (look for `CVDisplayLinkCreateWithCGDisplay
failed` in the output), the headless one reliably hangs on this machine, and force-killing it
leaves James's real browser — the one with the command center open — unable to open new tabs
or navigate until he fully restarts it. A temp `--user-data-dir` isolates the profile but not
the shared app-level singleton, so it does not prevent this. It has cost real time 3–4 times,
last on 08/28/26. If the browser is already misbehaving, check for an orphan with
`ps -eo pid,command | grep -iE "chrome|brave" | grep -- --headless`, kill it, and tell James to
restart the browser.

Use the standalone Chromium that Playwright already installed instead — a separate binary with
no desktop-app registration, zero conflict with Brave:
`~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`
(or `npx playwright screenshot …` — `playwright` is installed globally). Launch it with
`--remote-debugging-port=<port>` and drive it over CDP with Node's global `WebSocket` — the
browser-style API (`addEventListener` / `onmessage`), not the `ws` package's `.on()`. Kill it
when done. It has no real window, so call `Emulation.setDeviceMetricsOverride` to size the
viewport. To check for sideways scroll, measure `documentElement.scrollWidth` against
`clientWidth` and confirm with an actual `window.scrollTo(9999, 0)`: `overflow-x: hidden` on
`body` does not reliably clip when `html` is `visible`, and a bounding-box sweep alone will
flag decorative elements that never scroll.

If even the separate binary misbehaves, skip the screenshot — verify via logic plus an HTTP
DOM dump and ask James to eyeball the visual.
