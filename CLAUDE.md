# e3draft — working rules

Read `PRODUCT.md` for product truth, `ROADMAP.md` for state, `README.md` for how to run it.
Plans live in `plans/`. This file is the house rules.

## What this is

James's fantasy football draft command center. The shared board stays a Google Sheet his
leaguemates co-edit live; this app reads it and does all the thinking. See `PRODUCT.md`.

## The rules that matter

1. **Never let a pick fail silently.** If a typed name can't be matched, it must appear on
   screen as an unmatched pick. A drafted player shown as available costs James a pick, and it
   is the only failure in this app that is genuinely expensive. Do not "helpfully" fuzzy-match
   your way past ambiguity — `lib/players.js` deliberately refuses to guess between two players
   with the same surname.

2. **The sheet stays dumb.** No formulas, no hidden tabs, no IMPORTRANGE. Every calculation
   belongs in `lib/state.js`. The old setup put the engine in the spreadsheet and that is
   precisely what made it too slow and too fragile.

3. **Speed budget is 1–3 seconds end to end.** Local recompute is ~1.75ms, so effectively all
   of it is network. Don't add per-render work in the client; the server ships whole computed
   states and the client only frames them.

4. **James is not a developer.** Explain trade-offs in plain terms and give a recommendation.

5. **Don't invent league facts.** Scoring, roster slots, and keeper rules came from James
   directly and live in `PRODUCT.md`. The keeper round-cost is still undecided — leave it
   undecided rather than guessing.

6. **Two-way players are one human.** A player listed at two positions holds two rows on
   purpose (Travis Hunter is a WR and a CB). Drafting him must take every row. Keys are
   `name|position`, and taken-status is tracked by normalized name.

## Design

The visual world is a **camcorder viewfinder OSD**, chosen by James over the roll's assigned
direction. The direction contract is the first comment in `public/index.html` — read it before
touching the interface, and keep it accurate.

- Instrument rails are the camera body and stay letterbox black in both exposures. The scene
  between them re-exposes: **SUN** (bright field, dark OSD ink) is the default because the draft
  is outdoors on a laptop; **NIGHT** is the world as it ships.
- Amber `#FFB000` is caution only — scarcity, on-the-clock, live targets. Not decoration.
- 45° zebra is the blown-highlight warning: unmatched picks and the tier cliff. Nothing else.
- Corner brackets frame every region. The closed bracket pair means a locked target.
- No information by color alone — sunlight legibility is a stated accessibility requirement.
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

`config.json` takes `"source": "local"` plus `"localLimit": <n>` to replay the 2025 draft
partway. `?static=1` on the URL renders one snapshot instead of opening the SSE stream, which is
how headless screenshots are taken — the live page never finishes loading, so capture hangs
without it.

Headless Brave on macOS clamps windows to a 485px minimum, so narrow layouts must be verified in
a sized iframe, not with `--window-size`.
