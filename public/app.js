/* E3 Draft — command center client.
   Receives whole computed states over SSE and re-renders. The server does every
   calculation, so this file only ever frames what it is handed. */

import { esc, adp, tier, seg } from "./util.js";
import { openSetup, closeSetup, isSetupOpen, initSetup } from "./setup.js";

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
  gridBody: $("gridBody"),
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
};

/* Authored SVG, one stroke weight. The focus-lock mark is the viewfinder's own
   closed bracket pair, not a star glyph. */
const ICON = {
  lock: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M2 5.5V2h3.5M14 5.5V2h-3.5M2 10.5V14h3.5M14 10.5V14h-3.5"/></svg>`,
  cross: `<svg class="emptyframe__cross" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 5v10M20 25v10M5 20h10M25 20h10"/><circle cx="20" cy="20" r="2.8"/></svg>`,
  locked: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M4 6.5V4h2.5M12 6.5V4h-2.5M4 9.5V12h2.5M12 9.5V12h-2.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>`,
};

/* One player row, used by ON THE BOARD and by TARGET. The name block is the
   button that opens the focus card; the lock stays a separate one-click path,
   because during the draft starring has to cost nothing. */
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
    </span>
  </div>`;
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

/* ------------------------------------------------------------------ rails */

function renderRails(payload) {
  const s = payload.state;

  if (!payload.ok) {
    el.lamp.dataset.state = "error";
    el.lampText.textContent = "NO SIG";
  } else {
    el.lamp.dataset.state = "live";
    el.lampText.textContent = "REC";
  }

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
              <span class="ptarget__name">${esc(t.name)}</span>
              <span class="ptarget__at">${right}</span>
            </div>`;
          })
          .join("");
        return `<article class="plan${cls}">
          <div class="plan__head">
            <span class="plan__name">${esc(b.label)}</span>
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
   DB before the open D and a back fills RB before the flex. Greedy is right
   because the eligibility lists nest: anything that fits a narrow slot also
   fits the wider one behind it, never the reverse. */
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

function renderGrid(s) {
  const { teams, rounds, myIndex } = s.league;
  const byCell = new Map();
  for (const p of s.board.picks) byCell.set(`${p.round}:${p.teamIndex}`, p);

  // Every round note lands on its own round, written across the board the way
  // it sat in the margin of the old sheet.
  const noteFor = new Map((s.notes || []).map((n) => [n.round, n]));

  let html = `<table class="grid"><thead><tr><th scope="col"></th>`;
  html += teams
    .map((t, i) => `<th scope="col"${i === myIndex ? ' class="is-mine"' : ""}>${esc(t)}</th>`)
    .join("");
  html += `</tr></thead><tbody>`;

  for (let r = 1; r <= rounds; r++) {
    const note = noteFor.get(r);
    if (note) {
      html += `<tr class="grid__noterow"><td colspan="${teams.length + 1}">
        <span class="grid__note"><span class="grid__noterd seg">R${String(r).padStart(
          2,
          "0"
        )}</span>${noteMarkup(note.text)}</span>
      </td></tr>`;
    }

    html += `<tr><th scope="row">${String(r).padStart(2, "0")}</th>`;
    for (let c = 0; c < teams.length; c++) {
      const pick = byCell.get(`${r}:${c}`);
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
  for (const pos of Object.keys(state.available.byPosition)) {
    for (const p of state.available.byPosition[pos]) byId.set(p.id, p);
  }
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
  renderTeam(state);
  renderLog(state);
  renderGrid(state);
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

initSetup();

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
