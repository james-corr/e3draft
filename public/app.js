/* E3 Draft — command center client.
   Receives whole computed states over SSE and re-renders. The server does every
   calculation, so this file only ever frames what it is handed. */

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
  posbar: $("posbar"),
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
};

/* Authored SVG, one stroke weight. The focus-lock mark is the viewfinder's own
   closed bracket pair, not a star glyph. */
const ICON = {
  lock: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M2 5.5V2h3.5M14 5.5V2h-3.5M2 10.5V14h3.5M14 10.5V14h-3.5"/></svg>`,
  cross: `<svg class="emptyframe__cross" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 5v10M20 25v10M5 20h10M25 20h10"/><circle cx="20" cy="20" r="2.8"/></svg>`,
  locked: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M4 6.5V4h2.5M12 6.5V4h-2.5M4 9.5V12h2.5M12 9.5V12h-2.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>`,
};

let state = null;
let activePos = "ALL";
let seenPicks = new Set();
let firstPaint = true;

/* ---------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/* FFB ADP is stored round.pick (1.02), so it prints as-is with two decimals. */
const adp = (v) => (typeof v === "number" ? v.toFixed(2) : "—");
const tier = (v) => (v == null || v === "" ? "—" : String(v));

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

function renderBoard(s) {
  const starred = new Set(s.inventory.filter((i) => i.starred).map((i) => i.id));

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

  pool.sort((a, b) => (a.pros_rank ?? 9999) - (b.pros_rank ?? 9999));

  // Tier counts for the whole pool when unfiltered, for one position otherwise.
  const counts = new Map();
  for (const p of pool) {
    const t = p.pros_tier ?? "—";
    counts.set(t, (counts.get(t) || 0) + 1);
  }

  const groups = new Map();
  for (const p of pool.slice(0, 70)) {
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
      const on = starred.has(p.id);
      html += `<div class="prow">
        <span class="prow__main">
          <span class="prow__name">${esc(p.name)}</span>
          <span class="prow__sub">${esc(p.pos)} · ${esc(p.team ?? "—")} · BYE ${esc(p.bye ?? "—")}</span>
        </span>
        <span class="prow__figs">
          ${
            p.ffb_adp == null && p.ffb_tier == null
              ? `<span class="fig"><span class="fig__k">RK</span><span class="fig__v">${esc(
                  p.pos_rank_pros ?? p.pros_rank ?? "—"
                )}</span></span>`
              : `<span class="fig"><span class="fig__k">ADP</span><span class="fig__v">${adp(p.ffb_adp)}</span></span>
                 <span class="fig"><span class="fig__k">FFB</span><span class="fig__v">${tier(p.ffb_tier)}</span></span>`
          }
          <button class="lock" data-star="${esc(p.id)}" aria-pressed="${on}"
            aria-label="${on ? "Unstar" : "Star"} ${esc(p.name)}">${on ? ICON.locked : ICON.lock}</button>
        </span>
      </div>`;
    }
    html += `</div>`;
  }

  el.boardList.innerHTML = html || `<p class="empty">Nobody left at this position.</p>`;
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

const STARTERS = [
  ["QB", 1], ["RB", 2], ["WR", 3], ["TE", 1],
  ["DST", 1], ["K", 1], ["LB", 1], ["DE", 1], ["S", 1],
];

function renderTeam(s) {
  const r = s.myRoster;
  if (!r) {
    el.teamBody.innerHTML = `<p class="empty">Team “${esc(s.league.myTeam)}” isn’t on the board.</p>`;
    return;
  }

  const slots = STARTERS.map(([pos, need]) => {
    const have = r.counts[pos] || 0;
    return `<span class="slot${have < need ? " slot--unfilled" : ""}">
      <span class="slot__k">${pos}</span>
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

  let html = `<table class="grid"><thead><tr><th scope="col"></th>`;
  html += teams
    .map((t, i) => `<th scope="col"${i === myIndex ? ' class="is-mine"' : ""}>${esc(t)}</th>`)
    .join("");
  html += `</tr></thead><tbody>`;

  for (let r = 1; r <= rounds; r++) {
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
        <p class="emptyframe__text">Lock a player from ON THE BOARD and they show up here with live taken status.</p>
      </div>
    </div>`;
    return;
  }
  el.playerBody.innerHTML = s.inventory
    .map(
      (p) => `<div class="prow">
        <span class="prow__main">
          <span class="prow__name">${esc(p.name)}</span>
          <span class="prow__sub">${esc(p.pos)} · ${esc(p.team ?? "—")} · ${
            p.taken ? "TAKEN" : "AVAILABLE"
          }${p.tags.length ? " · " + esc(p.tags.join(", ")) : ""}</span>
        </span>
        <span class="prow__figs">
          <span class="fig"><span class="fig__k">ADP</span><span class="fig__v">${adp(p.ffb_adp)}</span></span>
          <span class="fig"><span class="fig__k">FFB</span><span class="fig__v">${tier(p.ffb_tier)}</span></span>
          <button class="lock" data-star="${esc(p.id)}" aria-pressed="true"
            aria-label="Unstar ${esc(p.name)}">${ICON.locked}</button>
        </span>
      </div>`
    )
    .join("");
}

/* ----------------------------------------------------------------- render */

function render(payload) {
  renderRails(payload);
  if (!payload.state) return;
  state = payload.state;

  renderUnmatched(state);
  renderPosbar(state);
  renderBoard(state);
  renderPlans(state);
  renderTeam(state);
  renderLog(state);
  renderGrid(state);
  renderTargets(state);
}

/* --------------------------------------------------------------- controls */

el.posbar.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pos]");
  if (!btn) return;
  activePos = btn.dataset.pos;
  renderPosbar(state);
  renderBoard(state);
});

document.addEventListener("click", async (e) => {
  const star = e.target.closest("[data-star]");
  if (!star) return;
  const id = star.dataset.star;
  const on = star.getAttribute("aria-pressed") === "true";
  star.setAttribute("aria-pressed", String(!on));
  star.innerHTML = !on ? ICON.locked : ICON.lock;
  try {
    await fetch(`/api/player/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ starred: !on }),
    });
  } catch {
    // Revert on failure rather than showing a lock that didn't save.
    star.setAttribute("aria-pressed", String(on));
    star.innerHTML = on ? ICON.locked : ICON.lock;
  }
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

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "1") setView("grid");
  else if (k === "2") setView("field");
  else if (k === "3") setView("player");
  else if (k === "e") setExposure(el.body.dataset.exposure === "sun" ? "night" : "sun");
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
