/* Shared by the viewfinder (app.js) and the setup overlay (setup.js). */

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/* FFB ADP is stored round.pick (1.02), so it prints as-is with two decimals. */
export const adp = (v) => (typeof v === "number" ? v.toFixed(2) : "—");

export const tier = (v) => (v == null || v === "" ? "—" : String(v));

/* DSEG14 is a real segment display: it draws digits beautifully and letters
   badly. Position ranks like "WR29" or "LB1" go in the UI face instead. */
export const seg = (v) => (/^[-+]?[\d.]+$/.test(String(v)) ? " seg" : "");
