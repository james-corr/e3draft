/* E3 Draft — the name field.
   One typing surface, attached to any text input: the pick box in the top rail
   and every plan target on the FIELD screen.

   Deliberately NOT a native <datalist>. Two things this has to do that a
   datalist cannot: press enter without having touched an arrow key and get the
   first match anyway, which is how James actually types a pick; and look like
   it belongs in the viewfinder, which a browser-drawn popup never will.

   It never decides who a name resolves to. That is lib/players.js on the
   server, and it stays there — this only offers candidates, and typing straight
   past the list is always allowed. */

import { esc } from "./util.js";

/* The same shape as normalizeName in lib/players.js, minus the suffix
   stripping: "D.K." and "DK" have to type-ahead to the same place. */
function fold(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MAX_ROWS = 8;

/**
 * Rank candidates for what's been typed.
 *
 * One rule: everything containing what you typed, in draft order, best first.
 * "chase" gives Ja'Marr Chase before Chase Brown even though only Brown's name
 * STARTS with it — where the letters happen to fall says nothing about who you
 * meant, and the better player almost always is.
 *
 * The caller hands the list already sorted by draft value and with drafted
 * players pushed to the back, so this only has to filter and preserve order.
 */
export function rank(items, query) {
  const q = fold(query);
  if (!q) return items.slice(0, MAX_ROWS);

  const out = [];
  for (const it of items) {
    const f = it.fold ?? (it.fold = fold(it.name));
    if (f.includes(q)) out.push(it);
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

let uid = 0;

/**
 * Attach the type-ahead to an input.
 *
 * `getItems()` returns the candidate list — `{ id, name, pos, team, taken }` —
 * and is called per keystroke so it can follow the live board. `onPick(item)`
 * fires on click, enter, or tab. `onCommit(text)` fires when enter is pressed
 * with the list closed or empty, i.e. James typed a name the list didn't offer;
 * without it, enter falls through to the form's own submit. `onRejected(item)`
 * fires when a drafted player is aimed at, so the caller can say why nothing
 * happened.
 *
 * A player already on the board is shown — knowing he is gone is the answer to
 * "where is he?" — but cannot be chosen. Arrow keys step over him, enter never
 * lands on him, and clicking him does nothing.
 *
 * `openOnFocus` (default true) governs whether the list appears the moment the
 * input gains focus. The BOARD cell editor turns this off and focuses its
 * input programmatically when it opens, so the list — anchored below the
 * input — doesn't unfold over the KEEPER/SET/CLEAR/CANCEL row underneath it
 * before James has touched anything. A real click on the input always opens
 * it regardless, and typing always does too, since `onInput` refreshes
 * unconditionally.
 *
 * Returns { destroy, close } so an inline editor can tear its own field down.
 */
export function attachCombobox(
  input,
  { getItems, onPick, onCommit, onRejected, openOnFocus = true } = {}
) {
  const id = `cbx-${++uid}`;
  const list = document.createElement("ul");
  list.className = "cbx";
  list.id = id;
  list.setAttribute("role", "listbox");
  list.hidden = true;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-autocomplete", "list");
  input.autocomplete = "off";

  let shown = [];
  let active = -1; // -1 means nothing highlighted, and enter takes the first row

  /* Anchored to the input in viewport coordinates rather than nested inside it.
     The rails and panels both clip their overflow, so a popover positioned
     inside either one gets cut off at the edge of its box. */
  function place() {
    const r = input.getBoundingClientRect();
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom}px`;
    list.style.width = `${r.width}px`;
  }

  function paint() {
    if (!shown.length) return close();
    list.innerHTML = shown
      .map((it, i) => {
        const bits = [it.pos, it.team || "—"].filter(Boolean).join(" · ");
        return `<li class="cbx__row" role="option" id="${id}-${i}"
          aria-selected="${i === active}" data-i="${i}"${
            it.taken ? ' data-taken="true" aria-disabled="true"' : ""
          }>
          <span class="cbx__name">${esc(it.name)}</span>
          <span class="cbx__meta">${esc(bits)}</span>
          ${it.taken ? `<span class="cbx__gone">GONE</span>` : ""}
        </li>`;
      })
      .join("");
    if (list.hidden) {
      list.hidden = false;
      document.body.appendChild(list);
      input.setAttribute("aria-expanded", "true");
    }
    place();
    input.setAttribute("aria-activedescendant", active >= 0 ? `${id}-${active}` : "");
    if (active >= 0) list.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    if (list.hidden) return;
    list.hidden = true;
    list.remove();
    active = -1;
    shown = [];
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");
  }

  function refresh() {
    shown = rank(getItems?.() || [], input.value);
    active = -1;
    paint();
  }

  /* Every row that can actually be chosen. Drafted players render but are not
     in here, which is what makes them unselectable by every route at once. */
  const selectable = () => shown.map((it, i) => (it.taken ? -1 : i)).filter((i) => i >= 0);

  /* The row enter takes: whatever is highlighted, or the first SELECTABLE one
     when nothing is. That fallback is the whole point — typing three letters
     and hitting enter has to land the obvious player without an arrow key. */
  function choose(i = active >= 0 ? active : selectable()[0]) {
    const it = shown[i];
    if (!it) return false;
    if (it.taken) {
      // Reached by clicking a struck-through row. Say why, change nothing.
      onRejected?.(it);
      return false;
    }
    input.value = it.name;
    close();
    onPick?.(it);
    return true;
  }

  const onInput = () => refresh();

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) return refresh();
      const pick = selectable();
      if (!pick.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Walks only the rows that can be chosen, so a run of drafted players at
      // the bottom is scenery rather than something to arrow through. Wraps off
      // the end to "nothing highlighted", keeping the first-match fallback one
      // keypress away.
      const at = pick.indexOf(active);
      const next = at < 0 ? (step > 0 ? 0 : pick.length - 1) : at + step;
      active = next < 0 || next >= pick.length ? -1 : pick[next];
      return paint();
    }
    if (e.key === "Enter") {
      if (!list.hidden) {
        if (choose()) {
          e.preventDefault();
          return;
        }
        // The list is open and every match is already drafted. Swallow the key
        // rather than letting it submit the raw text — that would record the
        // duplicate this whole path exists to prevent.
        if (!selectable().length) {
          e.preventDefault();
          onRejected?.(shown[0]);
          return;
        }
      }
      if (onCommit) {
        e.preventDefault();
        onCommit(input.value);
      }
      return;
    }
    if (e.key === "Tab") {
      if (!list.hidden && active >= 0) choose();
      else close();
      return;
    }
    if (e.key === "Escape") {
      // Closes the list and keeps what was typed. Only when it is already
      // closed does escape belong to whatever is behind it.
      if (!list.hidden) {
        e.stopPropagation();
        close();
      }
    }
  };

  const onFocus = () => {
    if (openOnFocus) refresh();
  };
  // Covers the case openOnFocus is off: a click is what's supposed to open it,
  // and a click on an input that already had focus never fires "focus" again.
  const onClick = () => refresh();
  const onBlur = () => setTimeout(close, 120); // let a click on a row land first
  const onListDown = (e) => {
    const row = e.target.closest("[data-i]");
    if (!row) return;
    e.preventDefault(); // don't blur the input out from under the click
    choose(Number(row.dataset.i));
    input.focus();
  };
  const reposition = () => {
    if (!list.hidden) place();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("focus", onFocus);
  input.addEventListener("click", onClick);
  input.addEventListener("blur", onBlur);
  list.addEventListener("mousedown", onListDown);
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  return {
    close,
    destroy() {
      close();
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("click", onClick);
      input.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    },
  };
}
