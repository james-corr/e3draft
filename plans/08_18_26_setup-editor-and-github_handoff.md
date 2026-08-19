---
Date last edited: 08_18_26
Date created: 08_18_26
---

# e3draft — watchlist, round notes, setup editor, and the parked GitHub push

Covers the session titled `Opus 5 - 8.18 - e3draft setup editor and watchlist`.

A **second session ran in this repo the same afternoon** and wrote its own handoff at
`plans/08_18_26_rankings-ingest_handoff.md` — the Fantasy Footballers UDK rankings importer.
That one is not covered here. Read both; they touch the same files.

---

## One thing is unfinished

**The GitHub repo was never created.** Everything else in this thread shipped. Skip to
"The parked GitHub push" if that's what you came for — it is a ~2 minute job with a decision
already made.

---

## What shipped

Three commits, all on `main`:

| Commit | What |
|---|---|
| `ff52616` | Unify stars and tags; surface the round notes |
| `84a1525` | The setup surface — plans and notes edited in the app |
| `4e36695` | Close a design-doc gap the hook caught |

### 1. The watchlist is one record

Stars and tags were the same idea in the old workbook and are now one inventory entry per
player: `{ starred, tags, note }`. Clicking a player's **name** (not the lock) opens a focus
card with every figure that exists for him, the lock, the five real tags — Breakout / Sleepers /
Busts / Late Round Fliers / My Guys — and a note field.

Tag chips sit under the position filter and compose with it, so "WR + MY GUYS" is a legal
question. Counts are over players **still on the board**, so a chip always promises what it
shows. The whole bar hides when nothing is tagged — a fresh season starts with no chrome.

### 2. The round notes render

Ten of James's own margin notes had been extracted during the migration with nothing displaying
them. They now appear twice: a **cue strip** under the top rail for the round in play (or the
next one ahead, dimmed), and as a **band across their own round** in the board grid. Lines
wrapped in `***asterisks***` render as emphasis.

### 3. The setup surface

The icon in the PLANS header opens MENU mode. Plans and round notes are edited in place, names
autocomplete against the real pool, and every target is checked by `POST /api/resolve` — the
**same matcher that reads the board on draft day**, so there is no second implementation to
drift.

The verdict column has three registers, and the middle one is the point:

- `WR · CIN` — will be found
- `NO MATCH — Bijan Robinson?` in alarm — a near miss, which is what a typo looks like
- a quiet `NOTE` — matched nothing and resembles nobody, so it is treated as the written
  reminder it usually is (`CHECK LATE ROUNDERS`), which the board already renders as a note

Saving goes through `validatePlan`, leaves a `.bak`, preserves fields the app doesn't recognise
(the `wentAt2025` markers survived a full round trip), and **reports how many incomplete rows it
dropped** rather than letting them vanish.

Endpoints added: `GET /api/plan`, `GET /api/players`, `POST /api/resolve`.

### Bug found and fixed

The page scrolled **44px sideways at phone widths**. The zoom marker is a full-track-width box
moved by `translateX` and reaches past its scale at the far stop. Clipped at the rail rather than
the track, which would also have cut the 1px the marker deliberately overhangs.

Worth knowing: an earlier session recorded "0 overflow at 375px" — that check was measuring the
wrong thing. `overflow-x: hidden` on `body` does **not** clip when `html` is `visible`, and a
bounding-box sweep alone flags decorative elements that never actually scroll. The method that
caught it is now written into `CLAUDE.md` under Testing.

### Verification

Driven in a real browser over the DevTools protocol (Node's global `WebSocket`, no
dependencies — the harness lived in the job tmp dir and is gone now, but `CLAUDE.md` records
the approach). Confirmed: 9 plans load, rename → dirty → save → the live board picks the new
name up over SSE, tags and locks round-trip to disk, Escape closes, filters compose, and the
name checker returns `TE · GB / ok` and `NO MATCH — Bijan Robinson? / bad` correctly.

Design detector is clean apart from the known `codex-grid-background` exception on the HUD dot
grid — reviewed, deliberately **not** suppressed so a future decorative grid still trips it.

---

## The parked GitHub push

### Where it stands

- **No remote configured.** `git remote -v` is empty.
- **Nothing exists on GitHub** — `james-corr/e3draft` 404s.
- `gh` is authenticated as `james-corr` with `repo` scope, so creating it needs no setup.
- Sibling projects: `output` and `dig_party_co` have remotes; `thursday` does not. So local-only
  is an existing pattern here, not an oversight.

### The decision already made

James chose: **public repo, with the two `.xlsx` workbooks left out.**

The reason for the exception — and this is the bit not to lose — is that
`JPC USE - Draft 2025 - in use.xlsx` has a **live Google Sheets URL embedded inside it**:

```
https://docs.google.com/spreadsheets/d/<REDACTED-SHEET-ID>/edit
```

That is the same class of thing as the `sheetId` in `config.json`, which is gitignored on
purpose. The API key is the secret, but sheet ID + the link-viewable sharing the setup
instructions call for means anyone who finds a public repo can read the board.

He was fine with the plans, notes and league names going public. He had not seen this.

### Why it stopped

The workbooks have been tracked since the first commit (`31bd3d2`), so removing them needs a
**history rewrite**. `git filter-branch` refused to run — "You have unstaged changes" — because
the rankings-ingest session was actively writing to `.gitignore`, `config.example.json` and
`package.json` at that moment. Rewriting history under a live session would have been genuinely
destructive.

**Nothing was damaged.** filter-branch aborted before touching anything.

That blocker has since cleared: the ingest session committed (`898fb63`, `6b564cc`, `b07735f`)
and the tree is clean at 12 commits. **Check `ListAgents` before rewriting anyway** — sessions
named `auto-rankings-ingest` were still showing busy when this was written.

### Safety net

A verified full-history bundle sits at:

```
~/Desktop/Workspaces/builds/.e3draft-prerewrite.bundle    (1.4 MB, hidden)
```

It records the complete history through `4e36695`. **Delete it once the push is done.**

Related: `git reflog expire --expire=now --all` ran as part of that aborted cleanup, so the
reflog safety net is gone. Every commit is still reachable from `main`, and the bundle covers
the rest.

### The commands to finish it

Verify the tree is clean and no other session is live first, then:

```bash
cd ~/Desktop/Workspaces/builds/e3draft

# 1. drop the two workbooks from every commit
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch "E3 Draft 2025.xlsx" "JPC USE - Draft 2025 - in use.xlsx"' \
  --prune-empty --tag-name-filter cat -- --all

rm -rf .git/refs/original
git reflog expire --expire=now --all
git gc --prune=now --quiet

# 2. keep them on disk but out of git from here on
printf '\n# Source workbooks — migration input, and one has a live Sheets URL inside it\n*.xlsx\n' >> .gitignore
git add .gitignore && git commit -m "Keep the source workbooks out of the repo"

# 3. confirm they are gone from history before publishing
git log --all --oneline -- "*.xlsx"     # must print nothing
git grep -I "<REDACTED>" $(git rev-list --all) | head   # must print nothing

# 4. create and push
gh repo create james-corr/e3draft --public --source=. --remote=origin --push \
  --description "Fantasy football draft command center — reads the league's shared Google Sheet live and does every taken/available/tier calculation locally"
```

Step 3 is the one not to skip. Publishing is not reversible — public repos get indexed, forked
and cached.

### Already verified safe to publish

- `config.json` has **never** been committed
- No `AIza…` key anywhere in any commit
- No email addresses in tracked files beyond the Claude co-author trailer
- No token/secret-shaped strings in tracked files
- `.auth/` (Fantasy Footballers session cookies, added by the ingest session) is gitignored
- Commit authorship is `James Corr <James.corr1990@gmail.com>` — normal for GitHub, but it does
  become public

---

## Still blocked on James

From `ROADMAP.md`, none of these are code problems:

1. **The keeper round-cost rule** — which round the forfeited pick comes from. Deliberately
   undecided in `PRODUCT.md`; do not invent it.
2. **Connect the live sheet** — `node tools/make-board-tab.mjs`, import the CSV as a *new* tab
   named `DRAFT BOARD`, share link-viewable, create the Google API key, fill `config.json`.
   Full steps in `README.md`.
3. **Rewrite the plans and round notes for this season** — they still hold 2025's targets. This
   is now a job he can do himself in the setup surface, which was the whole point of building it.

Note that `data/players.2026.json` now exists (from the ingest session) but the app still reads
2025 — `config.json` carries a `season` key, defaulting to 2025. Their handoff explains why the
switch was deliberately not flipped.

---

## Gotchas worth carrying forward

- **Two sessions in one repo will collide.** Two were editing `package.json` and
  `config.example.json` simultaneously. Run `ListAgents` before anything that rewrites history
  or moves branches.
- **`git filter-branch` refusing to run is a feature.** It caught the collision.
- **Design docs drift in pairs.** `DESIGN.md` and `.impeccable/design.json` got edited in one
  pass and one came out a rule short — second time that has happened on this project. Compare
  them with a normalized diff (strip backticks, asterisks, whitespace) rather than by eye; the
  sidecar is a paraphrase layer, so exact string matching gives false positives.
- **DSEG14 draws digits well and letters badly.** `seg()` in `public/util.js` decides.
- The `codex-grid-background` finding on `public/styles.css` is a knowing false positive. If
  James ever wants it silenced:
  `/impeccable hooks ignore-value codex-grid-background "*" --file "public/styles.css"`

## Screenshots

Six current captures live in `.impeccable/shots/` (gitignored, so local only):
FIELD in both exposures, the focus card, the setup surface, the board grid with notes, the
TARGET list, and the focus card at 390px.

The one thing nobody has verified: **SUN vs NIGHT under actual sunlight.** Contrast ratios check
out; glare on a particular laptop panel outdoors does not. Take it outside before draft day.
