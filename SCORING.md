---
Date last edited: 08_23_26
Date created: 08_20_26
---

# League scoring and roster structure

The league's settings, transcribed from the Yahoo league settings page on 08/20/26. Source
screenshots are in `scoring/`.

**This is the reference record for scoring and roster slots.** Everything here is either read
off the settings page or confirmed by James directly on 08/23/26 — nothing is inferred. Three
questions this file raised on 08/20/26 are now answered; they are kept at the bottom under
"Settled" with the answer, because the evidence pointed the wrong way on two of them and that
is worth remembering.

`data/league.json` carries the machine-readable copy in its `rosterSlots` and `scoring` fields,
filled from this file on 08/23/26. If the two ever disagree, this file is the source and
`league.json` is the copy.

---

## Roster

```
QB, WR, WR, WR, RB, RB, TE, W/R/T, K, DEF, D, DB, BN, BN, BN, BN, BN, BN, IR, IR
```

| Slot | Count | Eligible positions |
|---|---|---|
| QB | 1 | QB |
| WR | 3 | WR |
| RB | 2 | RB |
| TE | 1 | TE |
| W/R/T (flex) | 1 | WR, RB, TE |
| K | 1 | K |
| DEF | 1 | DST (team defense/special teams) |
| D | 1 | any defensive player — DE, DT, LB, CB, S |
| DB | 1 | defensive back — CB, S |
| BN (bench) | 6 | any |
| IR | 2 | injured-reserve only, not drafted |

- **12 starters, 6 bench, 2 IR — 20 spots, and the draft is 20 rounds** (confirmed by James
  08/23/26). The 18 active spots plus the 2 IR slots are what the twentieth round pays for.
- **Two IDP starters, not three** (confirmed 08/23/26): one open `D` and one `DB`. A LB, DE or
  DT can only fill the `D`; a CB or S can fill either, so a safety should be spent on the `DB`
  before the `D`.
- There is a **W/R/T flex**, which the older `PRODUCT.md` lineup note omitted entirely.
- Player pool positions: QB, RB, WR, TE, K, DST, LB, S, DE, DT, CB — every roster slot above
  has real players behind it.

## Offense

| Stat | League value | Yahoo default |
|---|---|---|
| Passing Yards | 1 per 25 yards; **+3 bonus at 300 yards** | — |
| Passing Touchdowns | **6** | 4 |
| Interceptions (thrown) | **-2** | -1 |
| Rushing Yards | 1 per 10 yards; **+3 bonus at 150 yards** | — |
| Rushing Touchdowns | 6 | — |
| **Receptions** | **0.5 (half-PPR)** | 0 |
| Receiving Yards | 1 per 10 yards; **+3 bonus at 150 yards** | — |
| Receiving Touchdowns | 6 | — |
| Return Touchdowns | 6 | — |
| 2-Point Conversions | 2 | — |
| Fumbles Lost | -2 | — |
| Offensive Fumble Return TD | 6 | — |

**The league is half-PPR** — 0.5 per reception, confirmed by James 08/23/26. No reception row
appears anywhere in the `scoring/` screenshots; that is the screenshots being incomplete, not
the league being standard scoring. Every other value below was read directly off the page.

Bolded rows are where the league departs from Yahoo's defaults. Two of them drive the rankings
pull in `tools/ingest/`: half-PPR selects FantasyPros' `half-point-ppr-cheatsheets.php` and the
Footballers' `HALF` scale, and the 6-point passing TD selects the `6pt QB` set — which moves
quarterbacks several spots. Both are already configured correctly.

## Kickers

| Stat | League value | Yahoo default |
|---|---|---|
| Field Goals 0–19 Yards | **1** | 3 |
| Field Goals 20–29 Yards | **2** | 3 |
| Field Goals 30–39 Yards | 3 | — |
| Field Goals 40–49 Yards | 4 | — |
| Field Goals 50+ Yards | 5 | — |
| Point After Attempt Made | 1 | — |
| Point After Attempt Missed | **-3** | 0 |

Distance-scaled field goals plus a -3 on a missed PAT. Kickers are more volatile here than in a
default league, in both directions.

## Defense / Special Teams (team DEF)

| Stat | League value |
|---|---|
| Sack | 1 |
| Interception | 2 |
| Fumble Recovery | 2 |
| Touchdown | 6 |
| Safety | 2 |
| Block Kick | 2 |
| Kickoff and Punt Return Touchdowns | 6 |
| Extra Point Returned | 2 |

**Points allowed:**

| Points allowed | Value |
|---|---|
| 0 | 10 |
| 1–6 | 7 |
| 7–13 | 4 |
| 14–20 | 1 |
| 21–27 | 0 |
| 28–34 | -1 |
| 35+ | -4 |

No Yahoo default is flagged on any DEF row — this section is Yahoo standard.

## Defensive Players (IDP)

| Stat | League value | Yahoo default |
|---|---|---|
| Tackle Solo | 1 | — |
| Tackle Assist | 0.5 | — |
| Sack | 2 | — |
| Interception | **2** | 3 |
| Fumble Force | 2 | — |
| Fumble Recovery | 2 | — |
| Defensive Touchdown | 6 | — |
| Safety | 2 | — |
| Pass Defended | 1 | — |
| Block Kick | 2 | — |
| Extra Point Returned | 2 | — |

Tackle-heavy scoring: 1 per solo tackle and 0.5 per assist, with only 2 for a sack. That favors
volume tacklers (linebackers, box safeties) over pass rushers for the open `D` slot, and it is
why the 85 LBs and 47 Ss in the pool matter more than the 34 DEs.

---

## Settled

All three answered by James on 08/23/26. Kept with their evidence because the evidence pointed
the wrong way on two of them, which is worth remembering the next time a settings page and a
draft history disagree.

1. **Receptions — half-PPR, 0.5 per catch.** `PRODUCT.md` was right and the screenshots were
   incomplete. No reception row appears anywhere in `scoring/`, which normally means standard
   scoring; it does not here. **Nothing needed changing** — `tools/ingest/fantasypros.mjs`
   already pulls `half-point-ppr-cheatsheets.php` and the UDK already pulls the `HALF (6pt QB)`
   set. No re-run, no rank movement.

   *The lesson:* absence of a row on that page is not evidence of a zero. Ask before acting on
   one.

2. **Round count — 20 rounds.** The roster reconciles once the IR slots are counted: 12
   starters + 6 bench + **2 IR = 20**. The eighteen *active* spots were the number I anchored
   on, and the last two rounds pay for the IR slots.

   **`totalPicks: 240` against `madePicks: 216` was never a defect.** The 2025 board simply
   stopped being filled in after round 18 — a habit of the league, not a bug in the engine.
   `"rounds": 20` in `data/league.json` is correct and stays.

3. **IDP slots — `D` + `DB`, two of them.** The settings page was right and `PRODUCT.md` was
   wrong. The 2025 draft agreed: three dedicated slots would have pulled roughly 12 defensive
   ends across the league and the draft took **2**, with 10 LB and 10 S — 22 IDP picks across
   12 teams, 1.83 each, not the ~2.8 three slots imply.

   (The `CB: 1` in `rosterObserved2025` is Travis Hunter, who holds a WR row and a CB row in the
   2025 pool and was drafted as a WR. Not an IDP pick, and the reason position counts sum to 217
   across 216 picks — `CLAUDE.md` rule 8 working, not a double count.)

   **Two things changed on 08/23/26:** `PRODUCT.md`, and the `MY TEAM` slot readout in
   `public/app.js`, which showed `LB 0/1 · DE 0/1 · S 0/1`. That readout was wrong twice over —
   it also had no `W/R/T` flex at all. It now renders the real twelve.

## Still open

Nothing.

**Keeper round cost** was the last item here. One keeper per team costing a draft pick, with
the forfeited round never settled — it blocked pre-filling keepers and nothing else. Closed
08/24/26 without a rule being decided: keepers are typed into the cell for the manager and the
round they actually cost, so the round is a fact James enters rather than a policy the app has
to hold. See `PRODUCT.md`.
