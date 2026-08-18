/* E3 Draft — setup overlay.
   The camcorder's MENU mode: everything you set before you start recording.

   This is where the nine contingency plans and the round notes get written, so
   that a new season is an evening of typing rather than an afternoon of editing
   JSON by hand. Nothing in here is meant to be touched while on the clock — the
   viewfinder is for that.

   Names are judged by the server, not here. `POST /api/resolve` runs the same
   matcher that will read these plans on draft day, so a target this editor calls
   good is a target the board will find. */

import { esc } from "./util.js";

const $ = (id) => document.getElementById(id);

let el = null;
let draft = null; // working copy; nothing is written until SAVE
let baseline = ""; // serialized draft as last loaded or saved, for dirty checks
let pool = null; // the full player list, fetched once per open
let checkTimer = null;
let hintTimer = null;
/* Last known verdict per typed name. Kept across rebuilds so adding a row
   doesn't blank every status while the next check is in flight. */
const verdicts = new Map();

function handles() {
  if (el) return el;
  el = {
    root: $("setup"),
    body: $("setupBody"),
    meta: $("setupMeta"),
    hint: $("setupHint"),
    save: $("setupSave"),
    list: $("playerNames"),
  };
  return el;
}

export function isSetupOpen() {
  return Boolean(el && !el.root.hidden);
}

/* ------------------------------------------------------------------- open */

export async function openSetup() {
  const e = handles();
  e.root.hidden = false;
  e.body.innerHTML = `<p class="empty">Reading the plans…</p>`;

  try {
    const [plan, players] = await Promise.all([
      fetch("/api/plan").then((r) => r.json()),
      pool ? Promise.resolve(pool) : fetch("/api/players").then((r) => r.json()),
    ]);
    pool = players;
    draft = { ...plan, notes: plan?.notes ?? [], branches: plan?.branches ?? [] };
    baseline = JSON.stringify(draft);
  } catch (err) {
    e.body.innerHTML = `<p class="empty">Couldn’t read the plans: ${esc(err.message)}</p>`;
    return;
  }

  // The name field autocompletes against the real pool. Native datalist, so it
  // costs nothing and behaves the way the rest of the machine already does.
  e.list.innerHTML = pool
    .map((p) => `<option value="${esc(p.name)}">${esc(p.pos)} · ${esc(p.team ?? "")}</option>`)
    .join("");

  render();
  e.root.querySelector(".setup__card")?.focus();
}

export function closeSetup({ force = false } = {}) {
  const e = handles();
  if (e.root.hidden) return true;
  if (!force && isDirty() && !confirm("Close setup and lose the unsaved edits?")) return false;
  e.root.hidden = true;
  draft = null;
  return true;
}

function isDirty() {
  return draft !== null && JSON.stringify(draft) !== baseline;
}

function markDirty() {
  const e = handles();
  e.save.disabled = !isDirty();
  e.meta.textContent = isDirty() ? "UNSAVED" : "SAVED";
  e.meta.dataset.dirty = String(isDirty());
}

/* ----------------------------------------------------------------- render */

/* Rebuilt only when the shape changes — adding a plan, deleting a target.
   Typing never re-renders, or the caret would jump on every keystroke. */
function render() {
  const e = handles();

  const noteRows = draft.notes
    .map(
      (n, i) => `<div class="erow erow--note" data-note="${i}">
        <input class="erow__rd seg" type="text" inputmode="numeric" data-field="round"
          value="${esc(n.round ?? "")}" aria-label="Note round" />
        <textarea class="erow__text" data-field="text" rows="${lineCount(n.text)}"
          aria-label="Note text">${esc(n.text ?? "")}</textarea>
        <button class="iconbtn" data-del-note="${i}" aria-label="Remove this note">${ICO.x}</button>
      </div>`
    )
    .join("");

  const planCards = draft.branches
    .map(
      (b, bi) => `<article class="ecard">
        <div class="ecard__head">
          <input class="ecard__name" type="text" data-branch="${bi}" data-field="label"
            value="${esc(b.label ?? "")}" aria-label="Plan name" />
          <button class="ebtn" data-del-branch="${bi}">DELETE PLAN</button>
        </div>
        <div class="ecard__body">
          ${b.picks
            .map(
              (t, ti) => `<div class="erow" data-branch="${bi}" data-target="${ti}">
                <input class="erow__rd seg" type="text" inputmode="numeric" data-field="round"
                  value="${esc(t.round ?? "")}" aria-label="Target round" />
                <input class="erow__name" type="text" list="playerNames" data-field="player"
                  value="${esc(t.player ?? "")}" aria-label="Target player" autocomplete="off" />
                <span class="erow__status" data-status="${bi}:${ti}"
                  data-state="${verdict(t.player).state}">${esc(verdict(t.player).text)}</span>
                <button class="iconbtn" data-del-target="${bi}:${ti}"
                  aria-label="Remove this target">${ICO.x}</button>
              </div>`
            )
            .join("")}
        </div>
        <button class="ebtn ebtn--add" data-add-target="${bi}">+ TARGET</button>
      </article>`
    )
    .join("");

  e.body.innerHTML = `
    <section class="esec">
      <div class="esec__head">
        <h3 class="esec__title">Round notes</h3>
        <button class="ebtn" data-add-note>+ NOTE</button>
      </div>
      <p class="esec__hint">What the draft does in a given round — when the kicker run
        starts, where the deadzone is. Wrap a line in ***asterisks*** to make it shout.</p>
      ${noteRows || `<p class="empty">No notes yet.</p>`}
    </section>

    <section class="esec">
      <div class="esec__head">
        <h3 class="esec__title">Contingency plans</h3>
        <button class="ebtn" data-add-branch>+ PLAN</button>
      </div>
      <p class="esec__hint">One plan per way the draft could break. Each is a full
        round-by-round target queue, and the board scores how much of it is still alive.</p>
      ${planCards || `<p class="empty">No plans yet.</p>`}
    </section>

    <section class="esec">
      <div class="esec__head">
        <h3 class="esec__title">Rankings</h3>
        <button class="ebtn" data-refresh>REFRESH FROM UDK</button>
      </div>
      <p class="esec__hint">Pulls today's Fantasy Footballers Ultimate Draft Kit rankings and
        rewrites the player pool. Takes a few seconds. Nothing is overwritten unless the whole
        pull checks out, and it is refused once the board has picks on it — this is a
        before-the-draft job.</p>
    </section>
  `;

  markDirty();
  checkNames();
}

/* Three outcomes, and the middle one matters: a plan row that matches nobody is
   not automatically a mistake. James writes reminders into these queues
   ("CHECK LATE ROUNDERS"), and the board already renders those as notes. A near
   miss with a suggestion is the real typo signal, and only that raises alarm. */
function verdict(name) {
  const key = String(name ?? "").trim();
  if (!key) return { state: "blank", text: "" };
  const v = verdicts.get(key);
  if (!v) return { state: "blank", text: "" };
  if (v.matched.length) {
    const m = v.matched[0];
    return { state: "ok", text: `${m.pos} · ${m.team ?? "—"}` };
  }
  return v.suggestion
    ? { state: "bad", text: `NO MATCH — ${v.suggestion}` }
    : { state: "note", text: "NOTE" };
}

const ICO = {
  x: `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>`,
};

function lineCount(text) {
  return Math.min(4, Math.max(1, String(text ?? "").split("\n").length));
}

/* --------------------------------------------------------- name checking */

/* Every target name, judged in one round trip. Debounced, because it fires on
   typing and there is no reason to ask the server per character. */
function checkNames() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(async () => {
    if (!draft) return;
    const cells = [];
    draft.branches.forEach((b, bi) =>
      b.picks.forEach((t, ti) => cells.push({ key: `${bi}:${ti}`, name: t.player || "" }))
    );
    if (!cells.length) return;

    let results;
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: cells.map((c) => c.name) }),
      });
      ({ results } = await res.json());
    } catch {
      return; // Leave the last known status rather than flashing a false alarm.
    }
    if (!results) return;

    const e = handles();
    results.forEach((r, i) => verdicts.set(String(cells[i].name).trim(), r));
    cells.forEach((cell) => {
      const slot = e.body.querySelector(`[data-status="${cell.key}"]`);
      if (!slot) return;
      const v = verdict(cell.name);
      slot.textContent = v.text;
      slot.dataset.state = v.state;
    });
  }, 300);
}

/* ------------------------------------------------------------------ edits */

function onInput(ev) {
  if (!draft) return;
  const t = ev.target;
  const field = t.dataset.field;
  if (!field) return;

  const noteRow = t.closest("[data-note]");
  if (noteRow) {
    const n = draft.notes[Number(noteRow.dataset.note)];
    if (!n) return;
    n[field] = field === "round" ? toRound(t.value) : t.value;
    if (field === "round") t.dataset.bad = String(n.round === "");
    markDirty();
    return;
  }

  const bi = Number(t.closest("[data-branch]")?.dataset.branch);
  if (Number.isNaN(bi)) return;
  const branch = draft.branches[bi];
  if (!branch) return;

  if (field === "label") {
    branch.label = t.value;
    // A plan James has named is one he thinks in — the board treats those
    // differently from an unnamed "Plan 4".
    branch.named = Boolean(t.value.trim()) && !/^plan \d+$/i.test(t.value.trim());
    markDirty();
    return;
  }

  const ti = Number(t.closest("[data-target]")?.dataset.target);
  if (Number.isNaN(ti)) return;
  const pick = branch.picks[ti];
  if (!pick) return;
  pick[field] = field === "round" ? toRound(t.value) : t.value;
  if (field === "round") t.dataset.bad = String(pick.round === "");
  markDirty();
  if (field === "player") checkNames();
}

function toRound(v) {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : "";
}

function nextRound(picks) {
  const last = picks.length ? Number(picks[picks.length - 1].round) : 0;
  return Math.min(20, (Number.isFinite(last) ? last : 0) + 1);
}

function onClick(ev) {
  const e = handles();
  if (!draft) return;

  if (ev.target.closest("[data-add-note]")) {
    draft.notes.push({ round: 1, text: "" });
    return render();
  }

  const delNote = ev.target.closest("[data-del-note]");
  if (delNote) {
    draft.notes.splice(Number(delNote.dataset.delNote), 1);
    return render();
  }

  if (ev.target.closest("[data-add-branch]")) {
    const n = draft.branches.length + 1;
    draft.branches.push({ id: `branch-${Date.now()}`, label: `Plan ${n}`, named: false, picks: [] });
    return render();
  }

  const delBranch = ev.target.closest("[data-del-branch]");
  if (delBranch) {
    const b = draft.branches[Number(delBranch.dataset.delBranch)];
    if (b && b.picks.length && !confirm(`Delete “${b.label}” and its ${b.picks.length} targets?`)) {
      return;
    }
    draft.branches.splice(Number(delBranch.dataset.delBranch), 1);
    return render();
  }

  const addTarget = ev.target.closest("[data-add-target]");
  if (addTarget) {
    const b = draft.branches[Number(addTarget.dataset.addTarget)];
    if (!b) return;
    b.picks.push({ round: nextRound(b.picks), player: "" });
    render();
    // Straight into the field that was just made — this is a typing surface.
    const rows = e.body.querySelectorAll(
      `[data-branch="${addTarget.dataset.addTarget}"][data-target] .erow__name`
    );
    rows[rows.length - 1]?.focus();
    return;
  }

  const refreshBtn = ev.target.closest("[data-refresh]");
  if (refreshBtn) return refreshRankings(refreshBtn);

  const delTarget = ev.target.closest("[data-del-target]");
  if (delTarget) {
    const [bi, ti] = delTarget.dataset.delTarget.split(":").map(Number);
    draft.branches[bi]?.picks.splice(ti, 1);
    render();
  }
}

/* --------------------------------------------------------------- rankings */

/* Re-pull the player pool from the source sites.
   Pre-draft maintenance, which is why it lives in here rather than on the
   draft-day rail. The server does the work and refuses the whole thing if the
   pull doesn't validate, so this only has to report what came back -- and it
   reports a refusal as loudly as a failure, because a refresh that quietly did
   nothing is the version of this that costs a pick. */
async function refreshRankings(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "PULLING…";
  hint("Pulling the latest rankings…");
  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      const why = body.errors?.length ? body.errors.join(" · ") : body.error || `refresh failed: ${res.status}`;
      throw new Error(why);
    }
    const notes = body.warnings?.length ? ` (${body.warnings.join("; ")})` : "";
    hint(`Rankings updated — ${body.players ?? body.total} players in the pool.${notes}`);
  } catch (err) {
    hint(`Rankings not changed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ------------------------------------------------------------------- save */

async function save() {
  const e = handles();
  if (!draft) return;
  e.save.disabled = true;
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `save failed: ${res.status}`);

    // The server sorts, trims and drops empty rows; take back what it stored so
    // the editor shows what is actually on disk.
    const dropped = rowCount(draft) - rowCount(body.plan);
    draft = body.plan;
    baseline = JSON.stringify(draft);
    render();
    hint(
      dropped > 0
        ? `Saved, but ${dropped} incomplete row${
            dropped === 1 ? "" : "s"
          } went with it — a row needs both a round and something written in it.`
        : "Saved. The previous version is kept beside it as a .bak file.",
      dropped > 0
    );
  } catch (err) {
    hint(`Couldn’t save: ${err.message}`, true);
    markDirty();
  }
}

function rowCount(plan) {
  return (
    (plan?.notes?.length || 0) +
    (plan?.branches || []).reduce((n, b) => n + (b.picks?.length || 0), 0)
  );
}

function hint(text, bad = false) {
  const e = handles();
  e.hint.textContent = text;
  e.hint.dataset.bad = String(bad);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    e.hint.textContent = "";
    e.hint.dataset.bad = "false";
  }, 6000);
}

/* ---------------------------------------------------------------- wiring */

export function initSetup() {
  const e = handles();
  e.body.addEventListener("input", onInput);
  e.body.addEventListener("click", onClick);
  e.save.addEventListener("click", save);
  for (const btn of e.root.querySelectorAll("[data-setup-close]")) {
    btn.addEventListener("click", () => closeSetup());
  }
}
