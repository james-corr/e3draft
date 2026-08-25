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
 * Three bands, in order: the whole query starts a name, the query starts any
 * word in the name ("gibbs" -> Jahmyr Gibbs), then anything containing it.
 * Within a band the caller's order wins, which is ranking order, so the best
 * player always sits above the merely-similarly-spelled one.
 */
export function rank(items, query) {
  const q = fold(query);
  if (!q) return items.slice(0, MAX_ROWS);

  const starts = [];
  const word = [];
  const loose = [];
  for (const it of items) {
    const f = it.fold ?? (it.fold = fold(it.name));
    if (f.startsWith(q)) starts.push(it);
    else if (f.includes(` ${q}`)) word.push(it);
    else if (f.includes(q)) loose.push(it);
    if (starts.length >= MAX_ROWS) break;
  }
  return [...starts, ...word, ...loose].slice(0, MAX_ROWS);
}

let uid = 0;

/**
 * Attach the type-ahead to an input.
 *
 * `getItems()` returns the candidate list — `{ id, name, pos, team, taken }` —
 * and is called per keystroke so it can follow the live board. `onPick(item)`
 * fires on click, enter, or tab. `onCommit(text)` fires when enter is pressed
 * with the list closed or empty, i.e. James typed a name the list didn't offer;
 * without it, enter falls through to the form's own submit.
 *
 * Returns { destroy, close } so an inline editor can tear its own field down.
 */
export function attachCombobox(input, { getItems, onPick, onCommit } = {}) {
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
          aria-selected="${i === active}" data-i="${i}"${it.taken ? ' data-taken="true"' : ""}>
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

  /* The row enter takes: whatever is highlighted, or the first one when nothing
     is. That fallback is the whole point — typing three letters and hitting
     enter has to land the obvious player without an arrow key. */
  function choose(i = active >= 0 ? active : 0) {
    const it = shown[i];
    if (!it) return false;
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
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Wraps, and steps off the top back to "nothing highlighted" so the
      // first-match fallback is always one keypress away.
      active = active + step;
      if (active >= shown.length) active = -1;
      if (active < -1) active = shown.length - 1;
      return paint();
    }
    if (e.key === "Enter") {
      if (!list.hidden && choose()) {
        e.preventDefault();
        return;
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

  const onFocus = () => refresh();
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
      input.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    },
  };
}
