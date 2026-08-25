/* E3 Draft — command center client.
   Receives whole computed states over SSE and re-renders. The server does every
   calculation, so this file only ever frames what it is handed. */

import { esc, adp, tier, seg } from "./util.js";
import { openSetup, closeSetup, isSetupOpen, initSetup } from "./setup.js";
import { attachCombobox } from "./combobox.js";

const $ = (id) => document.getElementById(id);

const el = {
  body: document.body,
  lamp: $("lamp"),
  lampText: $("lampText"),
  format: $("format"),
  clockLabel: $("clockLabel"),
  clockTeam: $("clockTeam"),
  counter: $("counter"),
  overall: $("overall"),
  poolCount: $("poolCount"),
  goneCount: $("goneCount"),
  unmatched: $("unmatched"),
  unmatchedText: $("unmatchedText"),
  cue: $("cue"),
  cueRd: $("cueRd"),
  cueText: $("cueText"),
  posbar: $("posbar"),
  tagbar: $("tagbar"),
  boardList: $("boardList"),
  plansList: $("plansList"),
  plansMeta: $("plansMeta"),
  teamBody: $("teamBody"),
  nextPick: $("nextPick"),
  logList: $("logList"),
  notesList: $("notesList"),
  notesMeta: $("notesMeta"),
  gridBody: $("gridBody"),
  gridMeta: $("gridMeta"),
  teamsEdit: $("teamsEdit"),
  teamsSave: $("teamsSave"),
  teamsCancel: $("teamsCancel"),
  boardClear: $("boardClear"),
  playerBody: $("playerBody"),
  zoomTrack: $("zoomTrack"),
  zoomFill: $("zoomFill"),
  zoomMarker: $("zoomMarker"),
  uptick: $("uptick"),
  uptickV: $("uptickV"),
  uptickAt: $("uptickAt"),
  exposure: $("exposure"),
  exposureText: $("exposureText"),
  focus: $("focus"),
  focusName: $("focusName"),
  focusBody: $("focusBody"),
  planEdit: $("planEdit"),
  entry: $("entry"),
  entrySlot: $("entrySlot"),
  entryTeam: $("entryTeam"),
  entryInput: $("entryInput"),
  entryEcho: $("entryEcho"),
  entryUndo: $("entryUndo"),
};

/* Authored SVG, one stroke weight. The focus-lock mark is the viewfinder's own
   closed bracket pair, not a star glyph. */
const ICON = {
  lock: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M2 5.5V2h3.5M14 5.5V2h-3.5M2 10.5V14h3.5M14 10.5V14h-3.5"/></svg>`,
  cross: `<svg class="emptyframe__cross" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 5v10M20 25v10M5 20h10M25 20h10"/><circle cx="20" cy="20" r="2.8"/></svg>`,
  locked: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M4 6.5V4h2.5M12 6.5V4h-2.5M4 9.5V12h2.5M12 9.5V12h-2.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>`,
  // The record button: taking a player is committing him to the tape.
  rec: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="4.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="6.6"/></svg>`,
};

/* One player row, used by ON THE BOARD and by TARGET. The name block is the
   button that opens the focus card; the lock and the take button stay separate
   one-click paths, because during the draft neither can cost a detour.

   TAKE consumes whatever pick is next on the board, whoever it belongs to —
   that is the whole job, since James is now typing every team's picks. It gets
   no confirm dialog: UNDO is one key away in the entry strip, and a modal on
   every pick would cost more over 240 picks than the occasional mis-click. */
function playerRow(p, { starred, tags = [], note = "", taken = false, wentAt = null, wentTo = null }) {
  const bits = [p.pos, p.team ?? "—", `BYE ${p.bye ?? "—"}`];
  if (taken) bits.push(`GONE ${wentAt ?? ""} ${wentTo ?? ""}`.trim());
  if (tags.length) bits.push(tags.join(", "));

  const rk = p.pos_rank_pros ?? p.pros_rank ?? "—";
  const figs =
    p.ffb_adp == null && p.ffb_tier == null
      ? `<span class="fig"><span class="fig__k">RK</span><span class="fig__v${seg(rk)}">${esc(
          rk
        )}</span></span>`
      : `<span class="fig"><span class="fig__k">ADP</span><span class="fig__v seg">${adp(p.ffb_adp)}</span></span>
         <span class="fig"><span class="fig__k">FFB</span><span class="fig__v${seg(
           tier(p.ffb_tier)
         )}">${tier(p.ffb_tier)}</span></span>`;

  return `<div class="prow${taken ? " prow--taken" : ""}">
    <button class="prow__main" data-focus="${esc(p.id)}">
      <span class="prow__name">${esc(p.name)}</span>
      <span class="prow__sub">${esc(bits.join(" · "))}</span>
      ${note ? `<span class="prow__note">${esc(note)}</span>` : ""}
    </button>
    <span class="prow__figs">
      ${figs}
      <button class="lock" data-star="${esc(p.id)}" aria-pressed="${Boolean(starred)}"
        aria-label="${starred ? "Unlock" : "Lock"} ${esc(p.name)} as a target">${
          starred ? ICON.locked : ICON.lock
        }</button>
      ${
        taken
          ? ""
          : `<button class="take" data-draft="${esc(p.name)}"
              aria-label="Mark ${esc(p.name)} drafted${nextSlotLabel()}">${ICON.rec}</button>`
      }
    </span>
  </div>`;
}

/* Named in the take button's label so a screen reader hears which pick is about
   to be consumed, not just that something will be. */
function nextSlotLabel() {
  const at = state?.board?.onTheClock;
  return at ? ` — takes pick ${at.label}, ${at.team}` : "";
}

let state = null;
let activePos = "ALL";
/* The watchlist filter. Composes with the position filter rather than replacing
   it, so "WR" + "MY GUYS" is a legal, and useful, question to ask. */
let activeTag = null;
let seenPicks = new Set();
let firstPaint = true;

/* Rebuilt once per payload, not once per frame: every player the client knows
   about, keyed by id, so the focus card can be opened from any row. Inventory
   entries overwrite pool rows because they carry watchlist and taken status. */
let byId = new Map();
/* id -> inventory record, for players James has starred, tagged, or annotated. */
let watch = new Map();

let focusId = null;
let focusReturn = null;

/* Every player in the pool, fetched once at boot. The stream only carries who
   is still AVAILABLE, and the type-ahead has to be able to offer a name that is
   already gone — both to say so, and because a plan written months ago names
   players who since went off the board. `taken` is stamped on per payload. */
let allPlayers = [];

/* The raw plan as it sits on disk, so the FIELD screen can edit it in place.
   The stream carries the COMPUTED branches, where names are resolved and rows
   are scored; that is the wrong thing to write back. */
let rawPlan = null;

async function loadPlayerList() {
  try {
    allPlayers = await fetch("/api/players").then((r) => r.json());
    // The pool lands after the first payload as often as before it, so the
    // ordering has to be built here too rather than only in render().
    rebuildCandidates();
  } catch (err) {
    console.error("couldn't read the player list", err);
  }
}

async function loadPlan() {
  try {
    rawPlan = await fetch("/api/plan").then((r) => r.json());
  } catch (err) {
    console.error("couldn't read the plans", err);
  }
}

/* Ids already on the board. Rebuilt per payload from what the pool no longer
   holds — the server is the one that decides who a typed name resolved to. */
let takenIds = new Set();

/**
 * Where a player goes in a list of candidates: his expected draft slot, as one
 * overall pick number, low first.
 *
 * FFB ADP is stored round.pick — 1.04 is the fourth pick of round one — so it
 * has to be flattened before it can be compared to anything. `pros_rank` is
 * already an overall rank and covers the players FFB doesn't price at all (IDP
 * and kickers have no ADP), which puts them below the priced players without a
 * special case.
 */
function draftValue(p) {
  const teams = state?.league?.teams?.length || 12;
  if (typeof p.ffb_adp === "number") {
    const round = Math.floor(p.ffb_adp);
    const slot = Math.round((p.ffb_adp - round) * 100);
    return (round - 1) * teams + slot;
  }
  return typeof p.pros_rank === "number" ? p.pros_rank : Infinity;
}

/* The type-ahead's candidate list: everyone in draft order, best first, with
   drafted players pushed to the back — still in draft order among themselves,
   so the block at the bottom reads the same way as the block at the top.

   Sorted once per board change rather than per keystroke; 1069 players is
   nothing to sort, but it is also nothing to sort repeatedly for no reason. */
let candidates = [];

function rebuildCandidates() {
  const open = [];
  const gone = [];
  for (const p of allPlayers) {
    p.taken = takenIds.has(p.id);
    p.value = draftValue(p);
    (p.taken ? gone : open).push(p);
  }
  const byValue = (a, b) => a.value - b.value || a.name.localeCompare(b.name);
  open.sort(byValue);
  gone.sort(byValue);
  candidates = open.concat(gone);
}

function pickCandidates() {
  return candidates;
}

/* ------------------------------------------------------------------ rails */

function renderRails(payload) {
  const s = payload.state;

  if (!payload.ok) {
    el.lamp.dataset.state = "error";
    el.lampText.textContent = "NO SIG";
  } else if (!payload.canEnterPicks) {
    // Replay mode: an old draft being read back off the fixture, not a live
    // one. Say so in the one place that is always on screen.
    el.lamp.dataset.state = "mock";
    el.lampText.textContent = "REPLAY";
  } else {
    el.lamp.dataset.state = "live";
    el.lampText.textContent = "REC";
  }

  el.entry.hidden = !payload.canEnterPicks;

  if (!s) return;

  const { onTheClock, madePicks, totalPicks, myNext } = s.board;
  const me = s.league.myTeam;

  if (onTheClock) {
    const mine = onTheClock.team === me;
    el.clockLabel.textContent = mine ? "YOU ARE UP" : "ON THE CLOCK";
    el.clockTeam.textContent = onTheClock.team;
    el.clockTeam.dataset.me = String(mine);
    el.counter.textContent = `R${String(onTheClock.round).padStart(2, "0")}:P${String(
      onTheClock.slot
    ).padStart(2, "0")}`;
  } else {
    el.clockLabel.textContent = "DRAFT COMPLETE";
    el.clockTeam.textContent = "—";
    el.clockTeam.dataset.me = "false";
    el.counter.textContent = "R--:P--";
  }

  if (!el.entry.hidden) {
    el.entrySlot.textContent = onTheClock ? onTheClock.label : "—";
    el.entryTeam.textContent = onTheClock ? onTheClock.team : "board full";
    el.entryInput.disabled = !onTheClock;
    el.entryUndo.disabled = madePicks === 0;
  }

  el.overall.textContent = `#${String(madePicks + 1).padStart(3, "0")} / ${totalPicks}`;
  el.format.textContent = `E3 · ${s.league.teams.length}T · ${s.league.rounds}R · HALF-PPR`;
  el.poolCount.textContent = s.available.total;
  el.goneCount.textContent = madePicks;

  el.nextPick.textContent = myNext
    ? myNext.picksAway === 0
      ? "on the clock"
      : `next ${myNext.label}`
    : "no picks left";

  if (myNext) {
    const now = myNext.picksAway === 0;
    el.uptick.dataset.now = String(now);
    el.uptickV.textContent = now ? "NOW" : myNext.picksAway;
    el.uptickAt.textContent = myNext.label;
  } else {
    el.uptick.dataset.now = "false";
    el.uptickV.textContent = "--";
    el.uptickAt.textContent = "DONE";
  }
}

/* ------------------------------------------------- unmatched pick warning */

function renderUnmatched(s) {
  const bad = s.board.unmatched;
  if (!bad.length) {
    el.unmatched.hidden = true;
    return;
  }
  el.unmatched.hidden = false;
  el.unmatchedText.innerHTML = bad
    .map(
      (u) =>
        `<strong>${esc(u.label)}</strong> ${esc(u.team)} typed “${esc(u.text)}” — ` +
        (u.suggestion ? `did they mean ${esc(u.suggestion)}?` : `no player matches.`)
    )
    .join("<br>");
}

/* -------------------------------------------------------------- round cue */

/* James wrote these into the margins of the old sheet over years of drafts —
   when the kicker run starts, where the RB deadzone is. They are the one thing
   in this app no rankings feed knows, so they render in his own words. */
function noteMarkup(text) {
  return esc(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // He wrapped the ones that matter most in asterisks. Keep the emphasis,
      // drop the asterisks.
      const hot = line.match(/^\*+(.*?)\*+$/);
      return hot ? `<strong class="cue__hot">${hot[1].trim()}</strong>` : line;
    })
    .join(`<span class="cue__sep" aria-hidden="true">·</span>`);
}

function renderCue(s) {
  const round = s.board.onTheClock?.round ?? null;
  const notes = s.notes || [];
  if (!round || !notes.length) {
    el.cue.hidden = true;
    return;
  }

  // The note for the round in play, or else the next one ahead — knowing the
  // kicker run lands in two rounds is worth as much as knowing it is here.
  const here = notes.find((n) => n.round === round);
  const ahead = here
    ? null
    : notes.filter((n) => n.round > round).sort((a, b) => a.round - b.round)[0];
  const note = here || ahead;

  if (!note) {
    el.cue.hidden = true;
    return;
  }
  el.cue.hidden = false;
  el.cue.dataset.ahead = String(!here);
  el.cueRd.textContent = `R${String(note.round).padStart(2, "0")}`;
  el.cueText.innerHTML = noteMarkup(note.text);
}

/* ------------------------------------------------------------ round notes */

/* The whole run of notes, in one scrolling column on the FIELD screen. They
   used to be written across the board grid a round at a time, which meant
   reading ahead cost a trip to another framing — and reading ahead is most of
   what they are for. The cue strip still calls the round in play; this is the
   rest of the tape. */
function renderNotes(s) {
  // Same rule as the plans panel: a pick landing mid-edit must not rebuild the
  // field and take the caret with it.
  if (editing && el.notesList.contains(editing.host)) return;

  const round = s.board.onTheClock?.round ?? null;
  const notes = [...(s.notes || [])].sort((a, b) => a.round - b.round);

  const ahead = round ? notes.filter((n) => n.round >= round).length : notes.length;
  el.notesMeta.textContent = notes.length ? `${ahead} ahead` : "";

  el.notesList.innerHTML =
    notes
      .map((n) => {
        const state = round === null ? "" : n.round < round ? "past" : n.round === round ? "now" : "ahead";
        return `<div class="rnote" data-state="${state}">
          <button class="rnote__rd seg" data-edit-note-round="${n.index}"
            title="Change which round this note is for">R${String(n.round).padStart(2, "0")}</button>
          <button class="rnote__text" data-edit-note-text="${n.index}"
            title="Edit this note">${noteMarkup(n.text)}</button>
        </div>`;
      })
      .join("") ||
    `<p class="empty">No round notes yet. Add them in SETUP — they're the one thing here no rankings feed knows.</p>`;
}

/* Round notes are edited where they are read, the same way plans are. Adding
   and deleting rows stays in SETUP: that is a between-drafts job, and a stray
   click during one should never be able to delete a year of margin notes. */

function editNoteText(host, i) {
  const note = rawPlan?.notes?.[i];
  if (!note) return;
  editInPlace(host, {
    value: note.text,
    multiline: true,
    onSave: (next) => {
      const was = note.text;
      note.text = next;
      savePlan().catch((err) => {
        note.text = was;
        echo("error", `note not changed: ${err.message}`);
      });
    },
  });
}

function editNoteRound(host, i) {
  const note = rawPlan?.notes?.[i];
  if (!note) return;
  editInPlace(host, {
    value: String(note.round),
    onSave: (next) => {
      const n = parseInt(String(next).replace(/[^\d]/g, ""), 10);
      const rounds = state?.league?.rounds ?? 20;
      if (!Number.isInteger(n) || n < 1 || n > rounds) {
        return echo("miss", `a round has to be between 1 and ${rounds}`);
      }
      const was = note.round;
      note.round = n;
      savePlan().catch((err) => {
        note.round = was;
        echo("error", `note not moved: ${err.message}`);
      });
    },
  });
}

/* ------------------------------------------------------------ on the board */

function renderPosbar(s) {
  const idp = new Set(s.idpPositions);
  const has = (p) => (s.available.byPosition[p] || []).length;
  // IDP is ranked on its own FantasyPros list — both scales start at rank 1 —
  // so it gets its own group rather than being merged into the overall board.
  const positions = [
    "ALL",
    ...s.positionOrder.filter((p) => !idp.has(p) && has(p)),
    ...(s.positionOrder.some((p) => idp.has(p) && has(p)) ? ["IDP"] : []),
    ...s.positionOrder.filter((p) => idp.has(p) && has(p)),
  ];
  el.posbar.innerHTML = positions
    .map(
      (p) =>
        `<button class="posbar__btn" role="tab" data-pos="${p}" aria-pressed="${
          p === activePos
        }">${p}</button>`
    )
    .join("");
}

/* Chips for the watchlist axis: LOCKED plus whichever tags are actually in use.
   Deliberately not amber — amber means caution in this world, and a filter is
   not a warning. A pressed chip inverts to solid ink instead. */
function renderTagbar(s) {
  // Counted over players still on the board, because that is what the chip
  // filters. A tag whose every member is gone drops off the bar — the TARGET
  // view is where those still show up.
  const counts = new Map();
  let locked = 0;
  for (const i of s.inventory) {
    if (i.taken) continue;
    if (i.starred) locked++;
    for (const t of i.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }

  const chips = [];
  if (locked) chips.push(["LOCKED", "LOCKED", locked]);
  for (const t of s.tagVocabulary) {
    if (counts.has(t)) chips.push([t, t.toUpperCase(), counts.get(t)]);
  }

  // A tag can go out of use while it is still the active filter — drop it
  // rather than leaving the board filtered by something with no chip.
  if (activeTag && !chips.some(([key]) => key === activeTag)) activeTag = null;

  el.tagbar.hidden = chips.length === 0;
  el.tagbar.innerHTML = chips
    .map(
      ([key, label, n]) =>
        `<button class="tagbtn" data-tag="${esc(key)}" aria-pressed="${key === activeTag}">${esc(
          label
        )}<span class="tagbtn__n seg">${n}</span></button>`
    )
    .join("");
}

function renderBoard(s) {
  // FantasyPros tiers are overall within a list, not per-position, so ALL is
  // one ranked run rather than position blocks stacked — stacking them buried
  // the best back on the board under ten quarterbacks. But offence and IDP are
  // two separate lists that both start at rank 1, so they never merge.
  const idp = new Set(s.idpPositions);
  const gather = (keep) => s.positionOrder.filter(keep).flatMap((p) => s.available.byPosition[p] || []);

  const pool =
    activePos === "ALL"
      ? gather((p) => !idp.has(p))
      : activePos === "IDP"
        ? gather((p) => idp.has(p))
        : (s.available.byPosition[activePos] || []).slice();

  const shown =
    activeTag === null
      ? pool
      : pool.filter((p) => {
          const w = watch.get(p.id);
          if (!w) return false;
          return activeTag === "LOCKED" ? w.starred : w.tags.includes(activeTag);
        });

  shown.sort((a, b) => (a.pros_rank ?? 9999) - (b.pros_rank ?? 9999));

  // Tier counts for the whole pool when unfiltered, for one position otherwise.
  const counts = new Map();
  for (const p of shown) {
    const t = p.pros_tier ?? "—";
    counts.set(t, (counts.get(t) || 0) + 1);
  }

  const groups = new Map();
  for (const p of shown.slice(0, 70)) {
    const t = p.pros_tier ?? "—";
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(p);
  }

  let html = "";
  // Only the best remaining tier raises the scarcity alarm. A late tier down to
  // one player is normal; the top tier running out is the cliff worth reaching.
  let isFirstGroup = true;

  for (const [t, list] of groups) {
    const remaining = counts.get(t) ?? list.length;
    const thin = isFirstGroup && remaining <= 3;
    isFirstGroup = false;
    const scope =
      activePos === "ALL" ? "TIER" : activePos === "IDP" ? "IDP TIER" : `${activePos} TIER`;

    html += `<div class="tier${thin ? " tier--thin" : ""}">
      <div class="tier__head">
        <span class="tier__label">${esc(scope)} ${esc(t)}</span>
        <span class="tier__zebra" aria-hidden="true"></span>
        <span class="tier__count">${remaining}<span class="tier__count-k"> left</span></span>
      </div>`;

    for (const p of list) {
      html += playerRow(p, watch.get(p.id) || { starred: false });
    }
    html += `</div>`;
  }

  el.boardList.innerHTML =
    html ||
    `<p class="empty">${
      activeTag ? "Nobody left carrying that tag." : "Nobody left at this position."
    }</p>`;
}

/* ------------------------------------------------------------------ plans */

function renderPlans(s) {
  // A pick landing mid-edit must not yank the field out from under the caret.
  // The panel repaints as soon as the edit closes, which is a moment later.
  if (editing && el.plansList.contains(editing.host)) return;

  const live = s.branches.filter((b) => b.liveCount > 0).length;
  el.plansMeta.textContent = `${live} of ${s.branches.length} alive`;

  el.plansList.innerHTML =
    s.branches
      .map((b) => {
        const dead = b.liveCount === 0;
        const hot = !dead && b.health <= 40;
        const cls = dead ? " plan--dead" : hot ? " plan--hot" : "";
        const rows = b.targets
          .map((t) => {
            // Some cells hold James's own reminders rather than a player name
            // ("CHECK LATE ROUNDERS"). Those are notes, not open targets.
            const kind = t.unknown ? "note" : t.taken ? "taken" : "live";
            const right = t.unknown ? "note" : t.taken ? esc(t.wentAt ?? "gone") : "open";
            return `<div class="ptarget ptarget--${kind}">
              <span class="ptarget__rd">R${String(t.round).padStart(2, "0")}</span>
              <button class="ptarget__name" data-edit-target="${b.index}:${t.index}"
                title="Change this target">${esc(t.name)}</button>
              <span class="ptarget__at">${right}</span>
            </div>`;
          })
          .join("");
        return `<article class="plan${cls}">
          <div class="plan__head">
            <button class="plan__name" data-edit-label="${b.index}"
              title="Rename this plan">${esc(b.label)}</button>
            <span class="plan__health">
              <span class="meter"><span class="meter__fill" style="transform:scaleX(${b.health / 100})"></span></span>
              <span class="plan__pct">${b.health}%</span>
            </span>
          </div>
          <div class="plan__body">${rows}</div>
        </article>`;
      })
      .join("") || `<p class="empty">No plans yet.</p>`;
}

/* ------------------------------------------------------- editing the plans */

/* The plans are the one thing in this app that cannot be reconstructed from
   anywhere else — years of accumulated judgment (CLAUDE.md rule 7) — so every
   inline edit goes through the same POST /api/plan the setup editor uses, which
   validates, leaves a .bak, and reports what it dropped.

   Swapping a name in place is the common draft-day move: the plan said Gibbs,
   Gibbs is gone, the branch now runs through someone else. Adding and deleting
   rows stays in SETUP — that is a between-drafts job. */

let editing = null; // { el, combo } — the one field open at a time

function stopEditing({ save = false } = {}) {
  if (!editing) return;
  const { host, combo, commit } = editing;
  editing = null;
  combo?.destroy();
  if (save) commit();
  else host.replaceWith(host.__was);
}

/** Swap a rendered label/name for a text field, and put it back when done. */
function editInPlace(host, { value, combobox, multiline, onSave }) {
  stopEditing();
  const was = host;
  // A round note is written across several lines and keeps its ***shouts***, so
  // it gets a real textarea rather than a single-line field that would silently
  // flatten it on the first edit.
  const input = document.createElement(multiline ? "textarea" : "input");
  if (multiline) {
    input.rows = Math.min(5, Math.max(2, String(value).split("\n").length));
  } else {
    input.type = "text";
  }
  input.className = `${host.className} ${host.className}--editing`;
  input.value = value;
  input.spellcheck = false;
  input.setAttribute("aria-label", host.title || "Edit");

  const commit = () => {
    const next = input.value.trim();
    input.replaceWith(was);
    // An emptied field reverts rather than saving. validatePlan drops rows with
    // no text in them, so a stray backspace here would silently delete a target
    // — the one kind of data loss this file is careful about.
    if (next && next !== value) onSave(next);
  };

  host.replaceWith(input);
  input.__was = was;
  editing = { host: input, commit, combo: null };

  if (combobox) {
    editing.combo = attachCombobox(input, {
      getItems: pickCandidates,
      onPick: () => stopEditing({ save: true }),
      onCommit: () => stopEditing({ save: true }),
    });
  } else {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // In a note, enter is a line break — that is what the notes are made
        // of. Cmd/Ctrl+Enter saves, and so does clicking away.
        if (multiline && !e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        stopEditing({ save: true });
      } else if (e.key === "Escape") {
        e.stopPropagation();
        stopEditing();
      }
    });
  }

  input.addEventListener("blur", () => setTimeout(() => stopEditing({ save: true }), 140));
  input.focus();
  input.select();
}

async function savePlan() {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rawPlan),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `save failed: ${res.status}`);
  rawPlan = body.plan; // take back what is actually on disk
}

function editPlanTarget(host, bi, ti) {
  const pick = rawPlan?.branches?.[bi]?.picks?.[ti];
  if (!pick) return;
  editInPlace(host, {
    value: pick.player,
    combobox: true,
    onSave: (next) => {
      const was = pick.player;
      pick.player = next;
      savePlan().catch((err) => {
        pick.player = was;
        echo("error", `plan not changed: ${err.message}`);
      });
    },
  });
}

function editPlanLabel(host, bi) {
  const branch = rawPlan?.branches?.[bi];
  if (!branch) return;
  editInPlace(host, {
    value: branch.label,
    combobox: false,
    onSave: (next) => {
      const was = { label: branch.label, named: branch.named };
      branch.label = next;
      // Same rule the setup editor uses: a plan James has actually named is one
      // he thinks in, and the board treats those differently from "Plan 4".
      branch.named = !/^plan \d+$/i.test(next);
      savePlan().catch((err) => {
        Object.assign(branch, was);
        echo("error", `plan not renamed: ${err.message}`);
      });
    },
  });
}

/* ---------------------------------------------------------------- my team */

/* The twelve starting slots, from SCORING.md. Three of them take more than one
   position -- the flex and both IDP slots -- so a slot carries the list of what
   can fill it rather than a single position. This readout used to show
   LB/DE/S and no flex at all, which was the old PRODUCT.md lineup rather than
   the league's. */
const STARTERS = [
  { slot: "QB", need: 1, pos: ["QB"] },
  { slot: "WR", need: 3, pos: ["WR"] },
  { slot: "RB", need: 2, pos: ["RB"] },
  { slot: "TE", need: 1, pos: ["TE"] },
  { slot: "W/R/T", need: 1, pos: ["WR", "RB", "TE"] },
  { slot: "K", need: 1, pos: ["K"] },
  { slot: "DEF", need: 1, pos: ["DST"] },
  { slot: "D", need: 1, pos: ["DE", "DT", "LB", "CB", "S"] },
  { slot: "DB", need: 1, pos: ["CB", "S"] },
];

/* Count each pick against the narrowest slot it still fits, so a safety fills
   DB before the open D and a back fills RB before the flex.

   Narrowest-first greedy is provably right here because the eligibility lists
   nest: DB{CB,S} sits inside D{DE,DT,LB,CB,S}, each skill position sits inside
   W/R/T{WR,RB,TE}, and those two chains never overlap. That is the property to
   preserve -- a new slot whose positions partly overlap an existing one's,
   rather than nesting inside or staying clear of it, breaks the guarantee and
   needs a real assignment pass instead of this loop. Sorting by breadth means
   the fill order falls out of the data and no one has to maintain it. */
function fillSlots(picks) {
  const have = new Map(STARTERS.map((x) => [x.slot, 0]));
  const narrowestFirst = [...STARTERS].sort((a, b) => a.pos.length - b.pos.length);
  for (const p of picks) {
    for (const x of narrowestFirst) {
      if (have.get(x.slot) < x.need && x.pos.includes(p.pos)) {
        have.set(x.slot, have.get(x.slot) + 1);
        break;
      }
    }
  }
  return have;
}

function renderTeam(s) {
  const r = s.myRoster;
  if (!r) {
    el.teamBody.innerHTML = `<p class="empty">Team “${esc(s.league.myTeam)}” isn’t on the board.</p>`;
    return;
  }

  const filled = fillSlots(r.picks);
  const slots = STARTERS.map(({ slot, need }) => {
    const have = filled.get(slot);
    return `<span class="slot${have < need ? " slot--unfilled" : ""}">
      <span class="slot__k">${slot}</span>
      <span class="slot__v">${have}/${need}</span>
    </span>`;
  }).join("");

  const rows = r.picks
    .map(
      (p) => `<div class="roster__row">
        <span class="roster__rd">${String(p.round).padStart(2, "0")}</span>
        <span class="roster__name">${esc(p.name)}</span>
        <span class="roster__pos">${esc(p.pos)}</span>
      </div>`
    )
    .join("");

  el.teamBody.innerHTML =
    `<div class="slots">${slots}</div>` +
    (rows || `<p class="empty">No picks yet.</p>`);
}

/* ----------------------------------------------------------------- the log */

function renderLog(s) {
  el.logList.innerHTML =
    s.recent
      .map((p) => {
        const isNew = !firstPaint && !seenPicks.has(p.overall);
        return `<div class="log__row${isNew ? " log__row--new" : ""}">
          <span class="log__at">${esc(p.label)}</span>
          <span class="log__name">${esc(p.player.name)}</span>
          <span class="log__team">${esc(p.team)}</span>
        </div>`;
      })
      .join("") || `<p class="empty">Nothing picked yet.</p>`;

  for (const p of s.board.picks) seenPicks.add(p.overall);
  firstPaint = false;
}

/* ---------------------------------------------------------------- the grid */

/* Who is drafting, in what order, and which column is James.
   `null` when TEAMS mode is closed. `order` is old-index-per-new-slot, which is
   exactly what POST /api/league takes — the identity order means nothing moved
   and only names changed. */
let teamsDraft = null;

function teamHeader(name, i, myIndex) {
  const mine = i === myIndex;
  if (!teamsDraft) {
    return `<th scope="col"${mine ? ' class="is-mine"' : ""}>${esc(name)}${
      mine ? `<span class="grid__me">YOU</span>` : ""
    }</th>`;
  }
  const last = teamsDraft.names.length - 1;
  return `<th scope="col" class="grid__edit${mine ? " is-mine" : ""}">
    <span class="grid__move">
      <button class="movebtn" data-move="${i}:-1" ${i === 0 ? "disabled" : ""}
        aria-label="Move ${esc(name)} one slot earlier">◀</button>
      <button class="movebtn" data-move="${i}:1" ${i === last ? "disabled" : ""}
        aria-label="Move ${esc(name)} one slot later">▶</button>
    </span>
    <input class="grid__name-input" type="text" spellcheck="false" data-team="${i}"
      value="${esc(name)}" aria-label="Name of the team drafting ${i + 1}${ordinalSuffix(i + 1)}" />
    <button class="mebtn" data-me="${i}" aria-pressed="${mine}"
      aria-label="${mine ? "You are" : "Mark yourself as"} ${esc(name)}">YOU</button>
  </th>`;
}

function ordinalSuffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
}

function openTeams() {
  if (!state) return;
  teamsDraft = {
    names: [...state.league.teams],
    order: state.league.teams.map((_, i) => i),
    myTeam: state.league.myTeam,
  };
  paintTeamsMode();
  renderGrid(state);
  el.gridBody.querySelector(".grid__name-input")?.focus();
}

function closeTeams() {
  teamsDraft = null;
  paintTeamsMode();
  if (state) renderGrid(state);
}

function paintTeamsMode() {
  const on = Boolean(teamsDraft);
  el.teamsEdit.hidden = on;
  el.boardClear.hidden = on;
  el.teamsSave.hidden = !on;
  el.teamsCancel.hidden = !on;
  el.gridMeta.textContent = on
    ? "rename · ◀▶ to reorder · YOU marks your seat"
    : `${state?.league?.rounds ?? 20} rounds · snake`;
}

async function saveTeams() {
  if (!teamsDraft) return;
  const moved = teamsDraft.order.some((from, to) => from !== to);
  const made = state?.board?.madePicks ?? 0;

  // Reordering re-cuts the snake. Each team keeps the players they already
  // took, but from here on they pick from a different seat — which is the point
  // of reordering, and also the kind of thing worth being sure about.
  if (moved && made > 0) {
    const ok = confirm(
      `Reorder the draft with ${made} pick${made === 1 ? "" : "s"} already on the board?\n\n` +
        `Every team keeps the players they've taken — they move to the new column with them. ` +
        `What changes is the snake order from here on.`
    );
    if (!ok) return;
  }

  el.teamsSave.disabled = true;
  try {
    const res = await fetch("/api/league", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teams: teamsDraft.names,
        myTeam: teamsDraft.myTeam,
        order: teamsDraft.order,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `save failed: ${res.status}`);
    closeTeams();
    echo("hit", moved ? "Teams saved and the board reordered." : "Teams saved.");
  } catch (err) {
    echo("error", `Teams not saved: ${err.message}`);
  } finally {
    el.teamsSave.disabled = false;
  }
}


/**
 * `fromStream` marks the repaint that a new payload triggered, as opposed to
 * one TEAMS mode asked for. A pick landing while a team name is being typed
 * must not rebuild the header and take the caret with it — but the ◀▶ and YOU
 * buttons rebuild it on purpose, from inside that same focused region, so they
 * cannot be told apart by looking at the focus alone.
 */
function renderGrid(s, { fromStream = false } = {}) {
  if (fromStream && teamsDraft && document.activeElement?.classList.contains("grid__name-input")) {
    return;
  }

  const { rounds } = s.league;
  // In TEAMS mode the header is a working copy, so a rename in progress is not
  // overwritten by the stream — and CANCEL has something to fall back to.
  const teams = teamsDraft ? teamsDraft.names : s.league.teams;
  const myIndex = teamsDraft
    ? teamsDraft.names.indexOf(teamsDraft.myTeam)
    : s.league.myIndex;

  const byCell = new Map();
  for (const p of s.board.picks) byCell.set(`${p.round}:${p.teamIndex}`, p);

  let html = `<table class="grid"><thead><tr><th scope="col"></th>`;
  html += teams.map((t, i) => teamHeader(t, i, myIndex)).join("");
  html += `</tr></thead><tbody>`;

  for (let r = 1; r <= rounds; r++) {
    html += `<tr><th scope="row">${String(r).padStart(2, "0")}</th>`;
    for (let c = 0; c < teams.length; c++) {
      // Reordering in TEAMS mode moves each team's picks with them, so the
      // preview reads a column from wherever that team currently sits.
      const from = teamsDraft ? teamsDraft.order[c] : c;
      const pick = byCell.get(`${r}:${from}`);
      const cls = [c === myIndex ? "is-mine" : "", pick ? "" : "is-empty"].filter(Boolean).join(" ");
      if (!pick) {
        html += `<td class="${cls}"></td>`;
        continue;
      }
      html += `<td class="${cls}">
        <span class="grid__name">${esc(pick.player.name)}</span>
        <span class="grid__pos">${esc(pick.player.pos)} · ${esc(pick.player.team ?? "")}</span>
      </td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  el.gridBody.innerHTML = html;
}

/* ------------------------------------------------------------- target view */

function renderTargets(s) {
  if (!s.inventory.length) {
    el.playerBody.innerHTML = `<div class="emptyframe">
      <div class="emptyframe__inner">
        ${ICON.cross}
        <span class="emptyframe__title">NO TARGET</span>
        <p class="emptyframe__text">Lock a player from ON THE BOARD, or open one to tag him, and he shows up here with live taken status.</p>
      </div>
    </div>`;
    return;
  }

  // Split at the only line that matters on the clock: can I still have him?
  const live = s.inventory.filter((p) => !p.taken);
  const gone = s.inventory.filter((p) => p.taken);

  const block = (label, list) =>
    list.length
      ? `<div class="tier">
          <div class="tier__head">
            <span class="tier__label">${esc(label)}</span>
            <span class="tier__zebra" aria-hidden="true"></span>
            <span class="tier__count">${list.length}</span>
          </div>
          ${list.map((p) => playerRow(p, p)).join("")}
        </div>`
      : "";

  el.playerBody.innerHTML = block("STILL ON THE BOARD", live) + block("GONE", gone);
}

/* ------------------------------------------------------------- focus card */

/* Rows that only exist for some players — IDP have no Fantasy Footballers
   numbers at all, and printing a wall of em-dashes would say nothing. */
const STATS = [
  ["PROS RK", (p) => p.pros_rank],
  ["PROS TIER", (p) => p.pros_tier],
  ["POS RK", (p) => p.pos_rank_pros],
  ["BYE", (p) => p.bye],
  ["FFB TIER", (p) => p.ffb_tier],
  ["FFB ADP", (p) => (typeof p.ffb_adp === "number" ? p.ffb_adp.toFixed(2) : null)],
  ["FFB POS", (p) => p.ffb_pos_rank],
  ["RISK", (p) => p.ffb_risk],
  ["UPSIDE", (p) => p.ffb_upside],
  ["ECR±ADP", (p) => (typeof p.ecr_vs_adp === "number" ? p.ecr_vs_adp : null)],
];

function focusStatus(p) {
  const taken = Boolean(p.taken);
  const text = taken
    ? `GONE ${p.wentAt ?? ""}${p.wentTo ? ` · ${p.wentTo}` : ""}`.trim()
    : "ON THE BOARD";
  return `<span class="focus__status" data-taken="${taken}">${esc(text)}</span>`;
}

function openFocus(id, trigger) {
  const p = byId.get(id);
  if (!p) return;
  focusId = id;
  focusReturn = trigger || null;

  const w = watch.get(id) || { starred: false, tags: [], note: "" };
  const stats = STATS.map(([k, get]) => [k, get(p)])
    .filter(([, v]) => v != null && v !== "" && v !== "-")
    .map(
      ([k, v]) =>
        `<span class="stat"><span class="stat__k">${esc(k)}</span><span class="stat__v${seg(
          v
        )}">${esc(v)}</span></span>`
    )
    .join("");

  el.focusName.textContent = p.name;
  el.focusBody.innerHTML = `
    <div class="focus__ident">
      <span class="focus__pos">${esc(p.pos)} · ${esc(p.team ?? "—")}</span>
      ${focusStatus(p)}
    </div>

    <div class="stats">${stats}</div>

    <button class="focus__lock" data-star="${esc(id)}" aria-pressed="${Boolean(w.starred)}">
      ${w.starred ? ICON.locked : ICON.lock}
      <span class="focus__locktext">${w.starred ? "LOCKED AS A TARGET" : "LOCK AS A TARGET"}</span>
    </button>

    <span class="focus__k">Watch tags</span>
    <div class="tagbar tagbar--set">
      ${state.tagVocabulary
        .map(
          (t) =>
            `<button class="tagbtn" data-tagset="${esc(t)}" aria-pressed="${w.tags.includes(
              t
            )}">${esc(t.toUpperCase())}</button>`
        )
        .join("")}
    </div>

    <span class="focus__k">Note</span>
    <textarea class="focus__note" id="focusNote" rows="3"
      placeholder="Why he is on this list.">${esc(w.note)}</textarea>
  `;

  el.focus.hidden = false;
  el.focus.querySelector(".focus__lock").focus();
}

function closeFocus() {
  if (el.focus.hidden) return;
  flushNote();
  el.focus.hidden = true;
  focusId = null;
  if (focusReturn && document.contains(focusReturn)) focusReturn.focus();
  focusReturn = null;
}

/* The stream can land while the card is open — including the pick that takes
   the very player being looked at. Only the status line is rewritten, so a note
   half-typed into the textarea survives the update. */
function syncFocus() {
  if (el.focus.hidden || !focusId) return;
  const p = byId.get(focusId);
  const slot = el.focus.querySelector(".focus__status");
  if (!p || !slot) return;
  slot.outerHTML = focusStatus(p);
}

/* ----------------------------------------------------------------- render */

let booted = false;

function render(payload) {
  renderRails(payload);
  if (!payload.state) return;
  state = payload.state;

  // Indexes are rebuilt per payload — which is per board change, not per frame.
  byId = new Map();
  const available = new Set();
  for (const pos of Object.keys(state.available.byPosition)) {
    for (const p of state.available.byPosition[pos]) {
      byId.set(p.id, p);
      available.add(p.id);
    }
  }
  // Taken is the complement of available across the whole pool, which is how
  // the server computes it — a two-way player gone at one position is gone.
  takenIds = new Set(allPlayers.filter((p) => !available.has(p.id)).map((p) => p.id));
  rebuildCandidates();

  watch = new Map();
  for (const i of state.inventory) {
    // Inventory rows win: they carry watch state and who took him.
    byId.set(i.id, i);
    watch.set(i.id, i);
  }

  renderUnmatched(state);
  renderCue(state);
  renderPosbar(state);
  renderTagbar(state);
  renderBoard(state);
  renderPlans(state);
  renderNotes(state);
  renderTeam(state);
  renderLog(state);
  renderGrid(state, { fromStream: true });
  renderTargets(state);
  syncFocus();

  if (!booted) {
    booted = true;
    if (wantFocus && byId.has(wantFocus)) openFocus(wantFocus, null);
  }
}

/* --------------------------------------------------------------- controls */

el.posbar.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pos]");
  if (!btn) return;
  activePos = btn.dataset.pos;
  renderPosbar(state);
  renderBoard(state);
});

el.tagbar.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tag]");
  if (!btn) return;
  // Clicking the live filter clears it, so one chip is both on and off switch.
  activeTag = btn.dataset.tag === activeTag ? null : btn.dataset.tag;
  renderTagbar(state);
  renderBoard(state);
});

/* One record per player holds the star, the tags, and the note. Every control
   writes through here, so the two ideas can never drift apart. */
async function patchPlayer(id, patch) {
  const res = await fetch(`/api/player/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  const { entry } = await res.json();
  // Keep the local index honest until the stream catches up a moment later.
  if (entry) watch.set(id, { ...(watch.get(id) || byId.get(id)), ...entry });
  else watch.delete(id);
  return entry;
}

function flushNote() {
  const box = document.getElementById("focusNote");
  if (!box || !focusId) return;
  const was = (watch.get(focusId) || {}).note || "";
  if (box.value === was) return;
  patchPlayer(focusId, { note: box.value }).catch((err) => console.error(err));
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-focus-close]")) return closeFocus();

  const take = e.target.closest("[data-draft]");
  if (take) return draftPlayer(take.dataset.draft);

  const target = e.target.closest("[data-edit-target]");
  if (target) {
    const [bi, ti] = target.dataset.editTarget.split(":").map(Number);
    return editPlanTarget(target, bi, ti);
  }

  const label = e.target.closest("[data-edit-label]");
  if (label) return editPlanLabel(label, Number(label.dataset.editLabel));

  const noteText = e.target.closest("[data-edit-note-text]");
  if (noteText) return editNoteText(noteText, Number(noteText.dataset.editNoteText));

  const noteRound = e.target.closest("[data-edit-note-round]");
  if (noteRound) return editNoteRound(noteRound, Number(noteRound.dataset.editNoteRound));

  const open = e.target.closest("[data-focus]");
  if (open) return openFocus(open.dataset.focus, open);

  const star = e.target.closest("[data-star]");
  if (star) {
    const id = star.dataset.star;
    const on = star.getAttribute("aria-pressed") === "true";
    const paint = (v) => {
      star.setAttribute("aria-pressed", String(v));
      const ico = v ? ICON.locked : ICON.lock;
      const text = star.querySelector(".focus__locktext");
      star.innerHTML = text
        ? `${ico}<span class="focus__locktext">${v ? "LOCKED AS A TARGET" : "LOCK AS A TARGET"}</span>`
        : ico;
    };
    paint(!on);
    try {
      await patchPlayer(id, { starred: !on });
    } catch {
      // Revert rather than showing a lock that didn't save.
      paint(on);
    }
    return;
  }

  const tagBtn = e.target.closest("[data-tagset]");
  if (tagBtn && focusId) {
    const t = tagBtn.dataset.tagset;
    const cur = (watch.get(focusId) || {}).tags || [];
    const on = cur.includes(t);
    const next = on ? cur.filter((x) => x !== t) : [...cur, t];
    tagBtn.setAttribute("aria-pressed", String(!on));
    try {
      await patchPlayer(focusId, { tags: next });
    } catch {
      tagBtn.setAttribute("aria-pressed", String(on));
    }
  }
});

/* Saved on blur, not per keystroke — a note is written once, and each save
   rewrites a file on disk. */
document.addEventListener("change", (e) => {
  if (e.target.id === "focusNote") flushNote();
});

const ZOOM_ORDER = ["grid", "field", "player"];

function setView(view) {
  el.body.dataset.view = view;
  for (const b of el.zoomTrack.querySelectorAll("[data-view]")) {
    b.setAttribute("aria-selected", String(b.dataset.view === view));
  }
  // Framing runs wide (W, the whole board) to tight (T, one target), so the
  // amber portion of the scale grows as the view narrows.
  const stop = Math.max(0, ZOOM_ORDER.indexOf(view));
  const pct = ((stop + 1) / ZOOM_ORDER.length) * 100;
  el.zoomFill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  el.zoomMarker.style.transform = `translateX(${pct}%)`;
}

el.zoomTrack.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) setView(btn.dataset.view);
});

function setExposure(mode) {
  el.body.dataset.exposure = mode;
  el.exposureText.textContent = mode.toUpperCase();
  el.exposure.setAttribute("aria-pressed", String(mode === "night"));
  try {
    localStorage.setItem("e3-exposure", mode);
  } catch {}
}

el.exposure.addEventListener("click", () => {
  setExposure(el.body.dataset.exposure === "sun" ? "night" : "sun");
});

el.planEdit.addEventListener("click", () => openSetup());

/* ---------------------------------------------------------- board controls */

el.teamsEdit.addEventListener("click", openTeams);
el.teamsCancel.addEventListener("click", closeTeams);
el.teamsSave.addEventListener("click", saveTeams);

el.boardClear.addEventListener("click", async () => {
  const made = state?.board?.madePicks ?? 0;
  if (!made) return echo("idle", "the board is already empty");
  if (!confirm(`Clear all ${made} pick${made === 1 ? "" : "s"} off the board?\n\nThere is no undo for this one.`)) {
    return;
  }
  try {
    await postBoard("reset");
    seenPicks = new Set();
    firstPaint = true; // nothing on the fresh board should flash as "just went"
    echo("idle", "board cleared");
  } catch (err) {
    echo("error", err.message);
  }
});

/* Typing in a team name edits the working copy only. Nothing reaches disk
   until SAVE, so a half-typed name can never become the league. */
el.gridBody.addEventListener("input", (e) => {
  const field = e.target.closest("[data-team]");
  if (!field || !teamsDraft) return;
  const i = Number(field.dataset.team);
  // Retitling the seat James is sitting in has to move the marker with it,
  // or SAVE would be rejected for naming a team that no longer exists.
  if (teamsDraft.names[i] === teamsDraft.myTeam) teamsDraft.myTeam = field.value;
  teamsDraft.names[i] = field.value;
});

el.gridBody.addEventListener("click", (e) => {
  if (!teamsDraft) return;

  const me = e.target.closest("[data-me]");
  if (me) {
    teamsDraft.myTeam = teamsDraft.names[Number(me.dataset.me)];
    return renderGrid(state);
  }

  const move = e.target.closest("[data-move]");
  if (move) {
    const [i, step] = move.dataset.move.split(":").map(Number);
    const to = i + step;
    if (to < 0 || to >= teamsDraft.names.length) return;
    for (const key of ["names", "order"]) {
      const arr = teamsDraft[key];
      [arr[i], arr[to]] = [arr[to], arr[i]];
    }
    renderGrid(state);
    // Keep the moved column under the cursor, so a team can be walked several
    // slots without hunting for the button again.
    el.gridBody.querySelector(`[data-move="${to}:${step}"]`)?.focus();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isSetupOpen()) {
      e.preventDefault();
      return void closeSetup();
    }
    if (!el.focus.hidden) {
      e.preventDefault();
      return closeFocus();
    }
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  // Both overlays are modal: don't reframe the scene behind them.
  if (!el.focus.hidden || isSetupOpen()) return;
  const k = e.key.toLowerCase();
  if (k === "1") setView("grid");
  else if (k === "2") setView("field");
  else if (k === "3") setView("player");
  else if (k === "e") setExposure(el.body.dataset.exposure === "sun" ? "night" : "sun");
});

/* The setup overlay writes the same plan file the FIELD screen edits in place.
   Re-read on close so the two can't drift apart. */
initSetup({ onClose: loadPlan });

/* Both are fetched once, not per keystroke: the pool for the type-ahead, the
   raw plan so plan targets can be edited where they are read. */
loadPlayerList();
loadPlan();

/* -------------------------------------------------------------- pick entry */
/* Every pick in the draft comes through here or through a row's take button.
   The server refuses writes independently in replay mode — hiding a control is
   not a guarantee, so /api/board/* checks for itself too. */

function echo(kind, text) {
  el.entryEcho.dataset.kind = kind;
  el.entryEcho.textContent = text;
}

async function postBoard(action, body) {
  const res = await fetch(`/api/board/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `board ${action} failed`);
  return json;
}

/* Record a pick at whatever slot is next. Shared by the entry box and by the
   take button on every player row — one path, so a pick typed and a pick
   clicked land identically and report identically. */
async function draftPlayer(name) {
  const text = String(name ?? "").trim();
  if (!text) return;
  try {
    const out = await postBoard("pick", { name: text });
    if (out.already) {
      // Recorded, but said out loud. A player entered twice burns a slot and
      // leaves James believing someone is still available who isn't.
      echo(
        "miss",
        `${out.at.label} — ${out.already.name} was ALREADY taken at ${out.already.label} by ${out.already.team}. Recorded anyway; UNDO if that was a mis-click.`
      );
    } else if (out.matched.length) {
      // Echo who it actually landed on rather than what was typed. "dk metcalf"
      // resolving to DK Metcalf is the matcher working, and seeing it is how
      // you learn to trust it before draft day.
      const who = out.matched.map((m) => `${m.name} · ${m.pos}${m.team ? ` · ${m.team}` : ""}`).join("  +  ");
      echo("hit", `${out.at.label} ${out.at.team} — ${who}`);
    } else {
      echo(
        "miss",
        `${out.at.label} "${out.text}" — no match${out.suggestion ? `. did you mean ${out.suggestion}?` : ""}`
      );
    }
  } catch (err) {
    echo("error", err.message);
  }
}

el.entry.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.entryInput.value.trim();
  if (!name) return;
  el.entryInput.value = "";
  await draftPlayer(name);
  el.entryInput.focus();
});

/* The type-ahead offers players; the form still owns what happens on enter, so
   a name the list never offered is submitted rather than swallowed. That
   matters: an unmatched pick has to be recordable (rule 1). */
attachCombobox(el.entryInput, {
  getItems: pickCandidates,
  onPick: () => el.entry.requestSubmit(),
  onRejected: (p) => echo("miss", `${p.name} is already drafted — ${whereWentText(p)}`),
});

/* Where a drafted player went, for the line that explains why he can't be
   picked. The stream already carries this on the inventory rows; the board is
   the fallback for anyone James never tagged. */
function whereWentText(p) {
  const w = watch.get(p.id);
  if (w?.wentAt) return `gone ${w.wentAt}${w.wentTo ? ` to ${w.wentTo}` : ""}`;
  const on = state?.board?.picks?.find((x) => x.player?.id === p.id);
  return on ? `gone ${on.label} to ${on.team}` : "already on the board";
}

el.entryUndo.addEventListener("click", async () => {
  try {
    const out = await postBoard("undo");
    echo("idle", `took back ${out.removed.label} "${out.removed.text}"`);
  } catch (err) {
    echo("error", err.message);
  }
  el.entryInput.focus();
});

/* ------------------------------------------------------------------ stream */

function connect() {
  const src = new EventSource("/api/stream");

  src.addEventListener("message", (ev) => {
    try {
      render(JSON.parse(ev.data));
    } catch (err) {
      console.error("bad payload", err);
    }
  });

  src.addEventListener("error", () => {
    el.lamp.dataset.state = "stale";
    el.lampText.textContent = "HOLD";
    // EventSource reconnects on its own; nothing to do but show it.
  });
}

/* Boot: a URL param wins over the saved preference, so a given exposure or
   framing can be linked to directly. */
const params = new URLSearchParams(location.search);
const wantExposure = params.get("exposure");
const wantView = params.get("view");

if (wantExposure === "night" || wantExposure === "sun") {
  setExposure(wantExposure);
} else {
  try {
    const saved = localStorage.getItem("e3-exposure");
    if (saved === "night" || saved === "sun") setExposure(saved);
  } catch {}
}

if (["grid", "field", "player"].includes(wantView)) setView(wantView);

/* ?focus=<player id> opens straight onto one player, same idea as the framing
   and exposure params. Deferred until the first payload lands, because the card
   is built from the state the server sends. */
const wantFocus = params.get("focus");
/* ?setup=1 opens straight into MENU mode. */
if (params.get("setup") === "1") openSetup();

/* ?static=1 renders one snapshot and never opens the stream. The live page
   holds an SSE connection open forever, which means it never reaches a "load
   finished" state — fine in a real browser, but it hangs headless capture. */
if (params.get("static") === "1") {
  fetch("/api/state")
    .then((r) => r.json())
    .then(render)
    .catch((err) => console.error(err));
} else {
  connect();
}
