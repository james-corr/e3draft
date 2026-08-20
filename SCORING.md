---
Date last edited: 08_20_26
Date created: 08_20_26
---

# League scoring and roster structure

The league's settings, transcribed from the Yahoo league settings page on 08/20/26. Source
screenshots are in `scoring/`.

This is the reference record for scoring and roster slots. Where this file and `PRODUCT.md`
disagree, **this file is the observed truth and `PRODUCT.md` is the older note** — the
conflicts are listed at the bottom under "Open questions", unresolved on purpose (`CLAUDE.md`
rule 5: don't invent league facts).

Nothing in the app reads these numbers today. `lib/state.js` counts players by position and
never scores anything. `data/league.json` already holds `"rosterSlots": null` and
`"scoring": null` waiting to be filled — this file is what fills them, once the open questions
below are settled. Until then it is documentation to build against, not config in use.

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

- **12 starters, 6 bench, 18 draftable spots.** The two IR slots are in-season only.
- Two IDP starters, not three: one open `D` and one `DB`. A LB or DE can only fill the `D`
  slot; a CB or S can fill either.
- Player pool positions in `data/players.2025.json`: QB, RB, WR, TE, K, DST, LB, S, DE, DT, CB
  — every roster slot above has real players behind it.

## Offense

| Stat | League value | Yahoo default |
|---|---|---|
| Passing Yards | 1 per 25 yards; **+3 bonus at 300 yards** | — |
| Passing Touchdowns | **6** | 4 |
| Interceptions (thrown) | **-2** | -1 |
| Rushing Yards | 1 per 10 yards; **+3 bonus at 150 yards** | — |
| Rushing Touchdowns | 6 | — |
| Receiving Yards | 1 per 10 yards; **+3 bonus at 150 yards** | — |
| Receiving Touchdowns | 6 | — |
| Return Touchdowns | 6 | — |
| 2-Point Conversions | 2 | — |
| Fumbles Lost | -2 | — |
| Offensive Fumble Return TD | 6 | — |

**No reception category appears on the settings page.** See "Open questions".

Bolded rows are where the league departs from Yahoo's defaults. The 6-point passing TD is the
one that actually moves the board — it is why the Fantasy Footballers UDK pull selects the
6-pt-passing-TD ranking set (`tools/ingest/`).

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

## Open questions — do not resolve by guessing

1. **Receptions.** `PRODUCT.md` records the league as **half-PPR (0.5 per reception)**,
   confirmed by James on 08/18/26, and that setting selects which UDK ranking set gets pulled.
   The Yahoo settings page shows **no reception row at all**, which normally means 0 points per
   reception (standard scoring). One of the two is wrong and it changes WR/TE/pass-catching-RB
   ranks materially. Needs James to check the Yahoo page for a "Receptions" line before any
   ranking pull is trusted.

2. **Round count.** `PRODUCT.md` and `CONTEXT.md` say **20 rounds**, and `data/league.json`
   carries `"rounds": 20`. The roster has **18 draftable spots** (12 starters + 6 bench; IR is
   in-season only), and `data/board.local.json` holds exactly 216 picks — 18 rounds × 12 teams.

   The app already shows the symptom: replaying the full 2025 board returns `totalPicks: 240`
   against `madePicks: 216`, and the board ends with round 19 on the clock for a draft that was
   over. Two rounds exist in the app that no pick will ever fill.

   18 is very likely the real number, but the keeper rule interacts with the count, so it stays
   flagged rather than corrected. Fixing it is a one-value change to `rounds` in
   `data/league.json`.

3. **IDP slots.** `PRODUCT.md` says the IDP starters are **LB, DE, S**. The settings page says
   **D and DB** — two slots, not three, and the first is open to any defensive player. The app
   follows `PRODUCT.md` today: MY TEAM renders LB 0/1, DE 0/1, S 0/1.

   The 2025 draft supports the settings page. Across 12 teams it produced 10 LB, 10 S and 2 DE
   — about **1.8 IDP picks per team, not 2.8**, and a LB/S mix rather than one of each of three
   kinds. That is what one open `D` slot plus one `DB` slot looks like in practice: a linebacker
   in the `D`, a safety in the `DB`. Three dedicated slots would have pulled roughly 12 DEs;
   the draft took 2.

   Two corrections follow if James confirms: `PRODUCT.md`, and the MY TEAM slot list.

   *Unrelated but found while checking:* `rosterObserved2025` in `data/league.json` lists
   `S: 10` and no LB or DE at all, though the fixture plainly contains 10 LBs and 2 DEs.
   Whatever generated that field dropped positions. It is a stale summary, not used by the
   engine, but it should not be trusted as evidence for anything.

4. **Keeper round cost.** Still undecided, unchanged. One keeper per team, costing a draft pick;
   which round the forfeited pick comes from has never been settled.
