---
Date last edited: 08_19_26
Date created: 08_19_26
---

# e3draft — the merged plan of attack

**This supersedes all four earlier plans in this folder.** They are kept for the reasoning
they record, but where they disagree with this document, this document wins. What each one
still contributes is listed at the bottom under "What the old plans leave behind."

Written 08/19/26. Draft is **a month or more out** (James, this session), which is the reason
this plan can be sequenced properly rather than triaged.

---

## Where this actually stands

The app is built and it works. That is worth saying plainly, because the four handoff docs
read like a project mid-crisis and it isn't one. Thirteen commits on `main`, a clean tree,
and the 2025 season replays end to end: 676 players, 216 picks matched with zero unmatched,
nine contingency plans, 1.75ms per recompute.

What's left is not really "building the app." It's four separate things:

| # | Workstream | Blocked on | Size |
|---|---|---|---|
| 1 | Finish the rankings pull (FantasyPros) | nothing — **unblocked this session** | ~half a day |
| 2 | Flip the app to the 2026 season | workstream 1 | ~an hour, plus a rehearsal |
| 3 | Connect the live Google Sheet | James (~15 min of clicking) | ~30 min |
| 4 | Publish to GitHub | nothing — sequenced last on purpose | ~10 min |

Plus one thing that is James's alone and can't be delegated: **rewriting the nine contingency
plans and ten round notes for this season.** They still hold 2025's targets. The setup surface
was built specifically so this is typing in the app rather than editing JSON.

---

## The finding that unblocks everything

The previous session left workstream 1 as "the real remaining work, and the blocker for
everything else," with the honest warning: *do not assume FantasyPros works like the UDK did.*

I ran the recon. **It is dramatically easier than the UDK was.**

FantasyPros ships its rankings **server-rendered**, as a `var ecrData = {…}` JSON blob sitting
in the page HTML. No login. No nonce. No borrowed ranking engine. Two page fetches and a
`JSON.parse` gets everything:

| Page | What it gives | Count | Tiers? |
|---|---|---|---|
| `rankings/half-point-ppr-cheatsheets.php` | QB/RB/WR/TE/DST/K, **half-PPR, draft mode** | 862 | yes |
| `rankings/idp-cheatsheets.php` | **The entire IDP pool** | 204 | yes |

The IDP page is the important one, and it lines up with the 2025 workbook almost exactly:

```
FantasyPros 2026:  LB 89  DE 42  S 41  CB 15  DT 17   = 204
Old workbook 2025: LB 85  DE 34  S 47  CB 14  DT 15   = 195
```

Same five positions, same magnitudes. This is the source, confirmed — not inferred.

**The trap I hit, so nobody repeats it.** The obvious URLs (`lb.php`, `dl.php`, `db.php`) return
`200` and look right, but they're **in-season weekly rankings** — standard scoring, week 1, and
**no tier data at all**. It's mid-August, so FantasyPros has already flipped its default IDP
pages over to the regular season. Only the `-cheatsheets.php` variants stay in draft mode. A
pull built against the wrong URL would have produced 100 plausible-looking LBs ranked for week
one, with the tiers silently missing. That is exactly the *wrong-and-confident* failure rule 1
exists to prevent.

### Why this matters for the IDP gap

I verified the gap rather than trusting the handoff. All **195 IDP players in the 2025 file
carry FantasyPros fields only** — `ffb_tier`, `ffb_risk`, `ffb_adp`, `ffb_pos_rank`,
`ffb_upside` are `null` on every single one. The Fantasy Footballers genuinely don't rank
defensive players, so FantasyPros isn't merely the *better* IDP source, it's the **only** one.

That is why the previous session was right not to flip the season, and why nothing downstream
can move until this lands:

```
2025 pool:  676 players   (481 offense/DST/K  +  195 IDP)
2026 pool:  377 players   (377 offense/DST/K  +    0 IDP)   ← what's on disk now
```

Flipping today would show every IDP pick as unmatched on draft day, in a league that starts
LB, DE and S.

---

## The sequence

Ordered by dependency, then by risk. Each phase leaves the app in a working state — nothing
here requires a big-bang switchover.

### Phase 1 — The FantasyPros adapter *(no decisions needed, start here)*

Write `tools/ingest/fantasypros.mjs` exporting the same `pull()` the Fantasy Footballers
adapter exports, and add it to the `SOURCES` map. `merge.mjs` and `refresh.mjs` need no
changes — the previous session designed for exactly this, and that design holds.

It supplies `pros_rank`, `pros_tier`, `pos_rank_pros`, and the whole IDP pool.

Four things to get right, all of them known now rather than discovered later:

1. **Use the `-cheatsheets.php` URLs, and assert on the payload.** The blob carries
   `type: "Draft Half PPR"` / `type: "Draft"` and `week: 0`. Check those explicitly and throw
   by name if they ever read `Weekly` — that's the guard against silently ingesting in-season
   ranks next August.

2. **The ±25% validation gate will trip, correctly.** Going from 377 to roughly 1,000 players
   is a ~180% jump, and the gate exists to refuse changes that large. This is a true positive,
   not a bug — the first combined write needs a deliberate, one-time override with eyes on the
   numbers, not a loosened threshold. Loosening it permanently would disarm the one thing
   standing between a bad pull and draft day.

3. **Two-way players fall out of `player_eligibility`.** FantasyPros already encodes them:
   `CB,S`, `LB,DE`, `DT,DE`. That maps straight onto rule 8 — one human, one row per position,
   drafting him clears every row. Travis Hunter has a real precedent here.

4. **Two 2025 fields aren't in these payloads:** `sos` (strength of schedule) and
   `ecr_vs_adp`. They live on different FantasyPros views. Worth a look, but they're
   nice-to-have colour — don't let them hold up the pool itself.

**Deliverable:** `npm run refresh` produces a `players.2026.json` with IDP in it, past the gate.

### Phase 2 — Flip to 2026 *(needs Phase 1)*

- `"season": 2026` in `config.json`
- Create `branches.2026.json` and `inventory.2026.json`. Missing files degrade gracefully, but
  **the nine plans are the real asset (rule 7)** — carry them forward from 2025 as a starting
  point rather than starting empty. James edits them, he doesn't retype them.
- **Then do a real dress rehearsal**: replay the 2025 board against the 2026 pool with
  `"source": "local"`. Expect unmatched picks — players who retired or changed teams — and
  that's the point. It proves the matcher surfaces them loudly instead of dropping them.

### Phase 3 — Connect the live sheet *(James's ~15 minutes)*

The only phase that needs James at a keyboard doing setup rather than thinking. Full steps are
in `README.md`; the shape is: run `node tools/make-board-tab.mjs`, import the CSV as a **new**
tab named `DRAFT BOARD`, set the sheet link-viewable, create the Google API key, paste the key
and sheet ID into `config.json`.

Do this **before** the plans get rewritten, so that the end-to-end path — leaguemate types a
name → it appears here in 1–3 seconds — is proven with weeks of slack, not on draft morning.

### Phase 4 — James rewrites the plans and notes *(his call, whenever)*

Nine contingency plans, ten round notes, all still 2025's. Done in the app's setup surface.
This is the one that benefits most from having a month, because it's judgment, not typing.

### Phase 5 — GitHub *(last, deliberately)*

Everything is ready and the decision is already made: **public repo, both `.xlsx` workbooks
stripped from history.** The exact commands are in
`08_18_26_setup-editor-and-github_handoff.md` and I'd run them verbatim.

The reason for stripping them is the one thing not to lose: `JPC USE - Draft 2025 - in
use.xlsx` has a **live Google Sheets URL embedded inside it**. Sheet ID plus the link-viewable
sharing the setup requires means anyone who finds the repo can read the board. The API key is
the secret, but the sheet ID is the door.

The blocker that stopped this last time has cleared — `git filter-branch` refused to run under
a live second session, and the tree is clean now. Two things before running it:

- **Run `ListAgents` first.** Two sessions in this repo collided once already.
- The safety bundle is verified present at `builds/.e3draft-prerewrite.bundle` (1.4 MB).
  Delete it *after* the push succeeds, not before.

**Why last:** a history rewrite is the only genuinely irreversible step in this whole plan, and
publishing can't be undone — public repos get indexed, forked and cached. It gains nothing by
happening early, and it's the one step where a mistake made in a hurry is permanent. With a
month of runway there's no reason to take that risk before the draft-critical work is done.

---

## Decisions I need from James

Only two, and one of them is small.

1. **The keeper round-cost rule** — which round the forfeited pick comes from. Outstanding
   since 08/13. `PRODUCT.md` deliberately leaves it undecided and rule 5 says don't invent it,
   so it stays a hole until James says. It blocks pre-filling keeper picks on the board, and
   nothing else.

2. **`sos` and `ecr_vs_adp`** — worth chasing down on other FantasyPros pages, or drop them?
   They were in the 2025 file. My recommendation: **drop them for now**, ship the pool, and add
   them later if their absence is actually felt on the board. They're context, not decisions.

---

## Risks, honestly

- **The `-cheatsheets.php` distinction is the sharp edge.** Handled in Phase 1, and it's the
  single most likely way this project produces confidently wrong data. Worth the assertion.
- **We depend on a class named `UdkRankings` in the Fantasy Footballers bundle.** Known,
  deliberate, and `npm run recon` names it when it breaks. Unchanged by this plan.
- **FantasyPros could restructure `ecrData`.** Same class of fragility, lower odds — it's a
  plain data blob, not lifted code. The adapter should throw by name rather than return empty.
- **`config.json` holds James's Fantasy Footballers password in plaintext.** It's gitignored and
  never committed, so this isn't a leak. But it's a real password sitting in a readable file. If
  it's reused anywhere else, change it there. Not urgent, worth knowing.
- **Nobody has checked SUN vs NIGHT in actual sunlight.** Contrast ratios pass; glare on a
  specific laptop panel outdoors is a different question, and the draft is outdoors. Free to
  test — take the laptop outside on a bright day well before draft day.

---

## What the old plans leave behind

- **`08_13_26_initial-build_plan.md`** — historical. Its direction was right and is now built.
  Its "proposed pieces" undersell the target grid. Nothing live.
- **`08_13_26_session-handoff.md`** — historical *as a plan*, but keep it: it's the only record
  of how the old workbook was structured and why the rebuild made the choices it did. Its open
  questions are all resolved except the keeper rule.
- **`08_18_26_rankings-ingest_handoff.md`** — **still live as reference.** The architecture
  diagram, the safety gate, and the "we run their engine rather than reimplement their maths"
  reasoning all stand. Its "What's next" section is replaced by this document; its recon
  warning about FantasyPros is now answered.
- **`08_18_26_setup-editor-and-github_handoff.md`** — **still live for the GitHub commands.**
  Phase 5 above is a pointer to it, not a replacement. Its gotchas section is worth reading
  before touching git.

---

## The short version

One real piece of engineering left (FantasyPros, now de-risked), one season flip, fifteen
minutes of Google setup, an afternoon of James's own judgment on the plans, and a careful
publish. In that order. There is a month, and the sequence needs about a week of actual work.
