---
name: E3 Draft — Command Center
description: A camcorder-viewfinder OSD for a live draft board — black instrument rails wrapping a scene that re-exposes between SUN and NIGHT.
colors:
  rail: "#0a0a0a"
  rail-ink: "#ffffff"
  rail-dim: "#8b9299"
  rail-line: "#2a2f33"
  caution: "#ffb000"
  caution-ink: "#0a0a0a"
  rail-alert: "#ff5a3c"
  sun-scene: "#e4e6e9"
  sun-scene-panel: "#eef0f2"
  sun-scene-sunk: "#d7dade"
  sun-ink: "#0a0c0e"
  sun-ink-dim: "#52585e"
  sun-hud: "#b4babf"
  sun-hud-soft: "#c9ced2"
  sun-alarm: "#9a5b00"
  sun-alarm-field: "#f2e2c4"
  sun-zebra-ink: "#0a0c0e"
  sun-zebra-gap: "#f6f2e6"
  night-scene: "#0a0a0a"
  night-scene-panel: "#121417"
  night-scene-sunk: "#17191d"
  night-ink: "#ffffff"
  night-ink-dim: "#858c93"
  night-hud: "#2f353a"
  night-hud-soft: "#23282c"
  night-alarm: "#ffb000"
  night-alarm-field: "#2a1f06"
  night-zebra-ink: "#ffffff"
  night-zebra-gap: "#0a0a0a"
typography:
  display:
    fontFamily: "DSEG14, ui-monospace, monospace"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  headline:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.02em"
  title:
    fontFamily: "DSEG14, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.08em"
  body:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.01em"
  value:
    fontFamily: "DSEG14, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
  label:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.1em"
rounded:
  none: "0"
spacing:
  hair: "3px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  gap: "10px"
  lg: "12px"
  xl: "16px"
  rail-pad: "18px"
components:
  panel:
    backgroundColor: "{colors.sun-scene-panel}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.none}"
    padding: "8px"
  panel-head:
    textColor: "{colors.sun-ink}"
    typography: "{typography.title}"
    padding: "9px 12px"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "52px"
  player-row:
    textColor: "{colors.sun-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
  player-row-hover:
    backgroundColor: "{colors.sun-scene-sunk}"
  posbar-button:
    textColor: "{colors.sun-ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  posbar-button-pressed:
    backgroundColor: "{colors.caution}"
    textColor: "{colors.caution-ink}"
  zoom-stop:
    textColor: "{colors.rail-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 4px"
    height: "34px"
  zoom-stop-selected:
    textColor: "{colors.caution}"
  exposure-toggle:
    textColor: "{colors.rail-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 11px"
  zebra-alert:
    backgroundColor: "{colors.sun-alarm-field}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.none}"
    padding: "7px 12px"
  slot:
    textColor: "{colors.sun-ink}"
    typography: "{typography.value}"
    rounded: "{rounded.none}"
    padding: "5px 6px"
  tag-chip:
    textColor: "{colors.sun-ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  tag-chip-pressed:
    backgroundColor: "{colors.sun-ink}"
    textColor: "{colors.sun-scene-panel}"
  round-cue:
    backgroundColor: "{colors.sun-scene-sunk}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  overlay-scrim:
    backgroundColor: "{colors.rail}"
    opacity: "0.78"
  focus-lock:
    textColor: "{colors.sun-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "9px"
  focus-lock-pressed:
    backgroundColor: "{colors.caution}"
    textColor: "{colors.caution-ink}"
  editor-field:
    backgroundColor: "{colors.sun-scene-sunk}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
  editor-button:
    textColor: "{colors.sun-ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 9px"
  editor-button-primary:
    backgroundColor: "{colors.sun-ink}"
    textColor: "{colors.sun-scene-panel}"
---

# Design System: E3 Draft — Command Center

## Overview

**Creative North Star: "The Viewfinder"**

The interface is a camera pointed at a player pool. Everything black is the camera body; everything between the black bars is the image the camera is seeing. That split is the whole system and it is load-bearing: the top and bottom instrument rails hold format, REC lamp, tape counter, pick clock, pool counts, framing scale and exposure toggle, and they are letterbox black in every state. The scene between them carries the subject — the available pool, the plans, the roster, the transaction log — and it re-exposes.

Density is instrument-panel dense and deliberately so. Type runs from 11px to 26px inside a single 100dvh frame with no page scroll; panels scroll internally instead. Nothing is decorative. There are exactly three materials — 45° zebra, a 1px HUD dot grid, and corner focus brackets — and each carries one meaning. Surfaces are square-cornered without exception (`0` radius everywhere) and separated by 1px HUD hairlines, not by shadow. No shadow token exists in the system at all; depth is entirely tonal.

Confirmed rejection: the dark neon draft-room card queue that every fantasy app ships. No card stacks, no glow, no gradient fills, no rounded pills.

**Key Characteristics:**
- Two exposures, one chassis: rails never change, the scene does
- SUN (bright field, dark OSD ink) is the default; NIGHT is the shipped-world variant
- Amber `#FFB000` is caution only, never decoration
- Zero corner radius, 1px hairline separation, no shadows in use
- Three-way type split: segmented readouts, condensed caps labels, condensed names
- 11px hard type floor and no information carried by color alone

## Colors

Two neutral fields — a fixed black camera body and a scene that swaps between a bright grey field and near-black — with a single amber that only ever means caution.

### Primary
- **Caution Amber** (`{colors.caution}`): The alarm channel and nothing else — the REC lamp, the tape counter, the on-the-clock team name, the "you in" countdown when it is James's pick, live plan targets, the selected framing stop and the zoom fill, the locked-target bracket, the selected position filter. On the light SUN scene it darkens to **Burnt Signal** (`{colors.sun-alarm}`); raw amber on that ground measures roughly 1.9:1 and is not shippable. On the black rails the raw amber is used in both exposures, because the rails are always black.

### Neutral — Camera Body (fixed, both exposures)
- **Letterbox Black** (`{colors.rail}`): The rails and the page background behind the frame.
- **OSD White** (`{colors.rail-ink}`): Primary rail text — the clock team, the countdown value, pool and gone counts.
- **Rail Grey** (`{colors.rail-dim}`): Rail labels, keys, unselected framing stops, stale-lamp state.
- **Rail Hairline** (`{colors.rail-line}`): Rail separators, the zoom track border and its tick array.
- **Lost Signal** (`{colors.rail-alert}`): The REC lamp in its error state, and only there. It means the board cannot be read at all — a different class of message from caution amber, which means something needs attention. Never collapse the two.

### Neutral — Scene (re-exposes)
- **Scene Field** (`{colors.sun-scene}` / `{colors.night-scene}`): The image ground, carrying the HUD dot grid.
- **Panel Face** (`{colors.sun-scene-panel}` / `{colors.night-scene-panel}`): Framed regions, plan cards, sticky grid headers.
- **Sunk** (`{colors.sun-scene-sunk}` / `{colors.night-scene-sunk}`): Row hover, meter troughs, empty grid cells, plan notes — the only recessed tone.
- **Scene Ink / Ink Dim** (`{colors.sun-ink}` / `{colors.sun-ink-dim}`; `{colors.night-ink}` / `{colors.night-ink-dim}`): Names and values; keys, secondary figures and struck-through targets.
- **HUD / HUD Soft** (`{colors.sun-hud}` / `{colors.sun-hud-soft}`): Every 1px border and the dot grid respectively.
- **Alarm Field** (`{colors.sun-alarm-field}` / `{colors.night-alarm-field}`): The tinted band behind a thinning tier, an unmatched-pick banner, and James's own column on the board grid.
- **Zebra Ink / Gap** (`{colors.sun-zebra-ink}` / `{colors.sun-zebra-gap}`): The two bands of the 45° warning texture.

### Named Rules

**The Camera Body Rule.** `--rail`, `--rail-ink`, `--rail-dim`, `--rail-line`, `--caution` and `--caution-ink` live on `:root` and are identical in both exposures. Only scene tokens live in the `[data-exposure]` blocks. A new rail element takes rail tokens; a new scene element takes scene tokens. Never move a rail token into an exposure block, and never paint a rail surface with a scene token.

**The Caution-Only Rule.** Amber marks scarcity, the clock, live targets and the current framing stop. If a proposed amber does not mean "act on this now," it is the wrong color. Audit test: count the amber on screen — if it exceeds a handful of marks, something decorative got through.

**The Ink Emphasis Rule.** Amber is caution; every other emphasis is solid ink on panel face — a pressed watchlist filter, a taken status block, the primary SAVE. This is the complement to the Caution-Only Rule and the question it answers: when something new wants to stand out, ask whether it is warning about anything. If it is not, it goes ink.

**The Sunlight Rule.** SUN is the default exposure and a product constraint: the draft happens outdoors on a laptop. Any new scene color must clear contrast against `{colors.sun-scene}` and `{colors.sun-scene-panel}` first, and amber must be substituted for `{colors.sun-alarm}` on light ground.

**The Three-Cue Rule.** No state is signalled by color alone. A thinning tier carries a heavier 2px rule, an amber label *and* the zebra band; a taken target is dimmed *and* struck through; an unfilled roster slot is dashed *and* dimmed. Add a second and third non-color cue before adding a hue.

## Typography

**Display / readout face:** DSEG14 (self-hosted, SIL OFL; fallback `ui-monospace, monospace`)
**Names & label face:** Saira Condensed 500/600/700 (self-hosted, SIL OFL; fallback `ui-sans-serif, system-ui, sans-serif`)

**Character:** A 14-segment instrument face against a tight condensed grotesque. The segmented face speaks in measurements and titles; the condensed face carries human names at speed and the tracked-out caps keys that label them.

### Hierarchy
- **Display** (DSEG14 700, 26px, line-height 1, 0.08em): The "YOU IN" countdown on the top rail — the single number that governs urgency, sized to be found without hunting.
- **Headline** (Saira Condensed 700, 20px, 0.02em, uppercase): The on-the-clock team name.
- **Title** (DSEG14 700, 12px, 0.08em): Panel titles, alert titles, the REC lamp, the tape counter, the exposure label. Every framed region is titled in the instrument face.
- **Body** (Saira Condensed 700, 15px, 0.01em): Player names in the pool. Secondary body at 13px/600 for plan targets, roster rows, log names and grid names.
- **Value** (DSEG14 700, 11–15px, tabular): Every measured *number* — ranks, ADP, tier counts, plan health percent, roster slot fill, pick labels, grid round numbers, round markers. Alphanumeric values (`WR29`, `LB1`) fall back to the condensed face; the segment face draws digits beautifully and letters badly.
- **Label** (Saira Condensed 600, 11px, 0.06–0.16em, uppercase): Field keys, panel meta, position filters, log team names, framing stops.

### Named Rules

**The Instrument-Face Rule.** Segmented type is for titles and measurements; condensed type is for names and the small caps keys that label them. The inverse — instrument face on the labels, plain type on the numbers — reads as chrome bolted onto a table and is the specific failure this split corrects. New readout? Segmented. New key? Condensed caps.

**The Segment Air Rule.** `.seg` carries `letter-spacing: 0.08em` and it is not negotiable. A 14-segment `1` is one vertical stroke, so `1.11` collapses into ambiguous bars at tighter tracking — and these characters carry decision values under a one-minute clock in daylight.

**The Digits-Only Rule.** `.seg` goes on values that are actually numeric. A position rank like `WR29` in a 14-segment face is a puzzle, not a readout, so the value helper tests `/^[-+]?[\d.]+$/` and only then adds the class. The exceptions are deliberate instrument labels — `R05:P04`, `R07` — where the letter is part of a tape counter and reads as one.

**The 11px Floor Rule.** No type below 11px anywhere in the system. Tracking, uppercase and tabular figures do the compression work that a smaller size would otherwise do.

## Layout

A fixed three-row viewfinder frame: 52px top rail, fluid scene, 52px bottom rail, filling `100dvh` with the page itself locked from scrolling. The frame's single column is declared `minmax(0, 1fr)` so a wide child can never stretch it past the viewport; every scrolling region is a panel body with its own `overflow-y`. The rails clip horizontally, because the zoom marker is a full-track-width box moved by `translateX` and reaches past its scale at the far stop.

The scene is a flex column, so the strips that appear above the framing — the unmatched-pick alert, the round cue — push the framing down rather than overflowing a clipped block. The visible framing takes `flex: 1; min-height: 0`.

Above the frame sits one overlay layer at `z-index: 20`: a fixed, centered grid holding a scrim and a panel card. Two surfaces live there — the focus card (520px, content-height) and setup (880px × 780px).

The default FIELD framing is a three-column scene at `1.35fr / 1.15fr / 1fr` — pool, plans, then a stacked column of roster over transactions at `0.9fr / 1.1fr` — with a 10px gap throughout. Single-panel framings (BOARD, TARGET) fill the scene as one full-height grid row rather than floating a panel above bare ground.

Spacing rhythm is tight and even: 3/4/6/8/10/12/16/18px. Panel bodies pad 8px, panel heads 9px×12px, the scene 16px, rails 18px horizontal.

Responsive behavior is triage, not reflow. Below 1200px the stacked roster/transactions column is dropped and the scene goes two-column. Below 820px the frame releases to `auto / 1fr / auto` with vertical page scroll, rails wrap with the clock group promoted to its own full-width first row, the reference-only readouts (format, overall pick) are dropped as they are reference rather than decision material, the scene goes single-column with the stack restored beneath, and panel bodies cap at 60vh. Setup takes the full screen there and its body is exempted from the 60vh cap, since an overlay owns the viewport rather than sharing a scrolling page; the focus card stays the size of what it has to say. Editor rows drop their verdict column under the name it belongs to. Below 420px only the zoom bar tightens.

## Elevation & Depth

Flat by construction. No shadow token exists in the system; nothing in the interface is lifted off its ground. Depth is entirely tonal and linear: a three-step scene ramp (field → panel face → sunk) plus 1px HUD hairlines, with corner brackets standing in for the visual weight a shadow would otherwise carry. The single inset used anywhere is a 2px amber edge marking James's own column on the board grid.

The one exception to flatness is not lift but occlusion: an overlay covers the scene with a letterbox-black scrim at 0.78 opacity — the camera body closing over the image — and the card on top of it is an ordinary bracketed panel at the same elevation as any other.

**The Flat Frame Rule.** Surfaces do not lift. If a new element needs to read as forward, move it up the tonal ramp, give it brackets, or put it behind a scrim — do not reach for a drop shadow.

## Shapes

Zero radius on every surface, control and texture — panels, buttons, chips, meters, the zoom track, the alert band. Squareness is the form language, not a default left unchanged.

Separation is a 1px HUD hairline; emphasis is a 2px rule (a thinning tier's head, the bracket stroke). Two recurring geometries define the world:

**Corner focus brackets.** Every framed region wears all four, drawn as one bordered box inset `-1px` and masked down to four 14px corner squares (`.panel::before`). The scene itself wears four 22px absolutely-positioned brackets at 0.55 opacity. The empty TARGET state draws a larger 3px, 30px-corner interior frame around a crosshair.

**45° zebra.** `repeating-linear-gradient(45deg, …)` at two scales: 3px bands inside a tier head, 8px bands on the unmatched-pick banner's 46px stripe. It spans its band structurally rather than sitting inside it as a chip.

**The Four Corners Rule.** Four bracket corners on every framed region. Two-corner crops read as an unfinished trim mark, not as framing.

**The Two-Texture Rule.** The world has exactly three materials — 45° zebra (blown-highlight warning: unmatched picks and the tier cliff, nothing else), the 1px HUD dot grid on the scene ground (22px pitch), and corner brackets. Any new pattern, gradient or fill is out of world.

## Components

### Panels (framed regions)
The primary container and the system's signature. Square (0 radius), panel-face background, 1px HUD border, four masked bracket corners. A head bar (9px×12px, 1px bottom hairline) carries a segmented title left and condensed-caps meta right; the board's head stacks its title over a full filter bar rather than squeezing the title to two lines. The body scrolls internally with a thin HUD-colored scrollbar; a `--flush` variant zeroes padding for the full-bleed board table.

### Buttons
- **Shape:** Square (0 radius) in every variant.
- **Position filter (chip-like):** 11px/700 tracked caps, 4px×6px, transparent 1px border, dim ink. Hover raises ink to full and reveals the HUD border. Pressed inverts to amber field with black ink.
- **Framing stop:** Sits inside the zoom track, transparent, 11px tracked caps in rail grey; hover goes OSD white, selected goes amber. `line-height: 1` keeps the label box inside the clear channel between the tick bands so no label ever sits on the amber fill.
- **Exposure toggle:** 5px×11px, 1px rail-line border, OSD white label, amber-stroked sun/moon glyph; hover lightens the border to rail grey.
- **Focus lock (star-to-target):** A 22px hit area holding a 15px open-bracket-pair mark at 0.5 opacity, rising to full on row hover; pressed it goes amber and swaps to the closed pair with a center dot. The closed bracket pair is what "locked" means in this world.
- **Watchlist chip:** Same geometry as the position filter but with a 1px HUD border at rest and a segmented count after the label. Pressed inverts to **solid ink**, not amber — amber is caution in this world and a filter is not a warning. This is the tag axis wherever it appears, filtering the board and setting tags on the focus card alike.
- **Icon button:** A 22px hit area holding a 14px mark at dim ink, rising to full on hover. Close, and the setup entry point in the PLANS head.
- **Editor button:** 11px/700 tracked caps, 6px×9px, 1px HUD border, dim ink; hover raises ink and border. The `--go` variant (SAVE) is solid ink with panel-face text, and greys to HUD when disabled — the primary action on a prep surface is ink, never amber.
- **Focus:** Global — a 2px amber outline at 2px offset, everywhere, both exposures.

### Player Row
The pool's primary line, shared by ON THE BOARD and TARGET. Name at 15px/700 with ellipsis, a tracked-caps sub-line (position · team · bye, plus where he went and which tags he carries), an optional 12px dim note line in James's own words, then right-aligned figure stacks pairing an 11px condensed key over a 13px value, and the lock at the end. Transparent 1px border at rest; hover fills to the sunk tone and reveals a HUD border. Transitions are 0.12s on border and background only.

The name block is itself the button that opens the focus card; the lock stays a separate control beside it, because during the draft locking a target has to cost one click. Nested buttons are invalid, so the row is a `div` with two sibling controls rather than a button wrapping a button. A taken row strikes its name through and drops it to dim ink — struck out rather than faded away, since the reason he was on the list is still worth reading.

### Tier Band
Groups the pool by scarcity. A head bar with a tracked-caps label, a flexible zebra slot and a segmented remaining count over a 1px hairline. In the thin state the rule thickens to 2px alarm, the head fills with alarm field, label and count go alarm, and the zebra band switches on — three cues at once.

### Plan Card
Bordered, panel-faced, with a head carrying an uppercase plan name and a health group: a 56px×8px bordered meter plus a segmented percentage. The meter fill is scaled via `transform: scaleX()`, not resized — animating width would relayout on every poll. Fill is ink by default, HUD when the plan is dead, amber when it is hot. Target rows read round · name · pick; taken targets dim and strike through, live targets keep full ink with an amber pick label, and written notes sit on the sunk tone in tracked caps so they never read as an available player.

### Round Cue
A single-line strip above the framing carrying James's own note for the round in play — or, when that round has none, the next one ahead, dropped to dim ink so a look-ahead never reads as the round he is in. Sunk tone, 1px HUD border, a segmented round marker then 13px body. Lines he wrapped in `***asterisks***` render as tracked caps at 700; multiple lines are joined by a dim middot. Advisory only: **no amber and no zebra**, which mean act-now. The same note also runs as a full-width band across its own round in the board grid, with the marker pinned `position: sticky; left: 6px` so it stays readable while the grid scrolls sideways.

### Focus Card
One player, pulled out of the frame. A 520px bracketed panel over the scrim: name in the **condensed** face at 20px (a name is a name, not a readout), position · team, and a status chip. The chip reads `ON THE BOARD` in dim outline, or `GONE 5.02 · KRAME` as a solid ink block — gone is not amber, because amber means act now and there is nothing left to act on. Below it a stat grid of bordered 78px-minimum cells, each an 11px key over a value, rendering only the figures that exist (IDP carry no Fantasy Footballers numbers, and a wall of em-dashes says nothing). Then the three watchlist controls: a full-width lock button that fills amber when pressed — a locked target being the one thing amber means here — the five tag chips, and a note field.

The card does not re-render from the stream. Only its status line is rewritten when a payload lands, so a pick that takes this player shows immediately without discarding a half-typed note.

### Setup Overlay
MENU mode: the prep surface, deliberately not the viewfinder. An 880px × 780px bracketed panel with a head, a scrolling body of sections, and a foot carrying a hint, DISCARD and SAVE. Same ink and the same frame as the scene, but roomy where the scene is dense — nothing here is read under a one-minute clock. `UNSAVED` in the head meta is the only caution the surface has, and it takes alarm.

Rows are a `46px / 1fr / 150px / 22px` grid: a segmented round field, a name field autocompleting against the real pool, a verdict, and a delete. Fields share one treatment across both overlays — sunk ground, 1px HUD border, condensed 13px. An emptied round takes an alarm border, because that row will not survive the save.

The verdict column has three registers, and the middle one is the point: `WR · CIN` in dim for a match; `NO MATCH — Bijan Robinson?` in alarm when the matcher can name a near miss, which is what a typo actually looks like; and a quiet `NOTE` when nothing matches and nothing is close, because these queues legitimately hold written reminders like `CHECK LATE ROUNDERS` and the board already renders those as notes.

### Zebra Alert
The one error surface. A 46px 45° zebra stripe flush against a body on alarm field, 1px alarm border, segmented title over 13px/600 text. `display: flex` is restated under `[hidden]` so the empty banner stays hidden.

### Board Grid
A collapsed-border table with sticky column headers and a sticky segmented row-number column, both on panel face. Cells are 1px HUD, min 108px, name over a dim position line. James's column takes the alarm field plus a 2px inset amber left edge; empty cells take the sunk tone.

Every cell is a full-bleed button — the padding lives on the button, not the `td`, so an empty square is as hittable as a full one. The hover affordance is a 3px inset rule down the leading edge, ink normally and amber in James's own column: a hover that repainted the cell would be overwriting what the column tint and the empty tint already say. Cell buttons render disabled in TEAMS mode, where the columns are a reorder preview rather than the board.

Three cell states beyond filled and empty. A **keeper** carries a `K` chip — solid ink on panel face, segmented type, floated onto the name's own line so a keeper row is never taller than the rows around it — with the word "keeper" alongside it for anything reading the page aloud. An **unmatched** cell takes the alarm field plus an 8px zebra stripe down its leading edge and reads `NO MATCH` in full-weight ink under the text exactly as typed; it is the same warning the CHECK SHEET banner carries, in the place the mistake actually is. Amber appears in neither: a keeper is a settled fact and an unmatched name is a blown highlight, and caution amber means neither of those.

### Cell Editor
A 248px popover parented to `document.body` and anchored to the clicked cell in viewport coordinates, flipping left or up at the frame edge. Body-parented for the same reason `.cbx` is: the panels clip their overflow, and the grid is rewritten wholesale on every pick that lands. Panel face inside a 1px ink border — it occludes rather than lifts, because the system has no shadow token. Holds a segmented round label and the manager's name, the shared type-ahead field on sunk face, a KEEPER checkbox, and SET / CLEAR / CANCEL. SET is the primary and takes solid ink, the same weight the setup surface gives SAVE.

### Zoom Bar (signature)
The framing control, and the primary action surface. A 280–400px bordered track carrying a tick array drawn as two repeating gradients riding the top and bottom edges, leaving a clear channel through the middle for the stop labels. The amber portion shows how far the framing is pushed toward tight, animated by `clip-path` rather than width so tick spacing stays constant; the position marker is a 2px amber bar on a full-width element moved with `transform: translateX()`. `W` and `T` end caps sit outside the track. The stops ride the scale itself rather than sitting in a separate tab strip.

### Empty States
Two registers. Inline empties are centered 13px/600 dim text. The TARGET empty is a full-scene frame: a 3px interior bracket box around a segmented title, crosshair and one line of copy — what a viewfinder looks like when it is not pointed at anything.

### Motion
**The One Moment Rule.** The system has exactly one authored motion: `@keyframes snap`, 0.55s, on a newly landed pick in TRANSACTIONS — the row flashes amber and settles. Everything else is state transition (0.12–0.15s on color and border, 0.32s on the zoom, 0.35s on the scene re-exposure, 0.5s on plan meters), plus the REC lamp's 2.4s opacity pulse. All easing is `cubic-bezier(0.16, 1, 0.3, 1)`. Expensive properties are refused: transitions run on `transform`, `clip-path`, `color`, `border-color`, `background-color` and `opacity`, never on a layout property. `prefers-reduced-motion` collapses all animation and transition durations to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** keep rail tokens on `:root` and scene tokens in the `[data-exposure]` blocks. The rails are the camera body; they do not re-expose.
- **Do** ship SUN as the default exposure, persist the user's choice, and honor the `?exposure=` override.
- **Do** substitute `{colors.sun-alarm}` for raw amber on any light scene ground.
- **Do** put segmented type on titles and measurements and condensed type on names and keys.
- **Do** keep `letter-spacing: 0.08em` on every `.seg` element.
- **Do** give every framed region all four bracket corners.
- **Do** back every state with at least two non-color cues.
- **Do** reserve amber for caution — scarcity, on the clock, a live or locked target. Every other emphasis, including a pressed filter and a primary save, is solid ink.
- **Do** occlude with the letterbox scrim when a surface takes over, and keep the card on it an ordinary bracketed panel.
- **Do** animate `transform` and `clip-path`; keep layout properties out of every transition.
- **Do** keep the HUD dot grid as-is. It is one of the world's three named materials on a measurement surface, and the `codex-grid-background` advisory it trips is a knowing, reviewed exception left unsuppressed on purpose — so that a future *decorative* grid still trips it. Do not "fix" it.
- **Do** self-host both faces from `public/fonts/` under SIL OFL with licences alongside.

### Don't:
- **Don't** use amber for anything that is not caution — no amber headings, borders, links or decoration.
- **Don't** use 45° zebra for anything but a blown-highlight warning (unmatched picks, the tier cliff).
- **Don't** collapse Lost Signal into caution amber, or spend it anywhere but the lamp's error state. Two failures, two colors.
- **Don't** introduce a fourth texture, a gradient fill, or a drop shadow. Depth is tonal.
- **Don't** add corner radius. Every surface in this system is square.
- **Don't** set type below 11px.
- **Don't** crop brackets to two corners.
- **Don't** add a second authored animation. One moment, on a landing pick.
- **Don't** float a single panel above bare scene ground — single-panel framings fill the frame.
- **Don't** carry state in color alone.
- **Don't** put the segment face on anything that isn't digits, outside the deliberate tape-counter labels.
- **Don't** let the scene clip a strip that belongs above the framing — the scene is a column, so add siblings, don't overlay them.
