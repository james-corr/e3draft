import { normalizeName } from "../../lib/players.js";

/**
 * Fold one or more sources into the players.<season>.json shape.
 *
 * The join key is normalizeName(name) + "|" + pos, reusing the app's own
 * matcher from lib/players.js. That function is the single source of truth for
 * "are these two strings the same player" -- a second, subtly different
 * matcher here is exactly how "D.K. Metcalf" ends up in the file twice.
 *
 * This is an OUTER join. A player in only one source still lands, with the
 * other source's fields null. That is already true of the 2025 file (only 280
 * of 676 rows carry ffb_tier), it is what lets an FFB-only pull be useful
 * before FantasyPros is wired up, and it is what stops a second source from
 * ever silently dropping players the first one found.
 */

/** The full field set, so every row has the same keys whatever it came from. */
const SHAPE = {
  pros_rank: null,
  pros_tier: null,
  name: null,
  team: null,
  pos_rank_pros: null,
  bye: null,
  sos: null,
  ecr_vs_adp: null,
  ffb_tier: null,
  ffb_risk: null,
  ffb_adp: null,
  ffb_pos_rank: null,
  ffb_upside: null,
  pos: null,
  id: null,
};

const FFB_FIELDS = ["ffb_tier", "ffb_risk", "ffb_adp", "ffb_pos_rank", "ffb_upside"];
const PROS_FIELDS = ["pros_rank", "pros_tier", "pos_rank_pros", "sos", "ecr_vs_adp"];

const key = (name, pos) => `${normalizeName(name)}|${String(pos || "?").toLowerCase()}`;

/**
 * id keeps the format extract_from_xlsx.py established (raw-lowercased
 * name|pos) so nothing downstream has to change. The normalized key above is
 * used for joining only.
 */
const idOf = (name, pos) => `${String(name).toLowerCase()}|${String(pos || "?").toLowerCase()}`;

export function merge(sources) {
  const byKey = new Map();

  for (const rows of sources) {
    for (const row of rows || []) {
      if (!row?.name || !row?.pos) continue;
      const k = key(row.name, row.pos);

      let rec = byKey.get(k);
      if (!rec) {
        rec = { ...SHAPE, name: row.name, pos: row.pos, id: idOf(row.name, row.pos) };
        byKey.set(k, rec);
      }

      // First source to supply a field wins; later sources only fill blanks.
      // Sources are passed in priority order, so this is deliberate rather than
      // incidental -- it means a re-run can't flip values around at random.
      for (const [field, value] of Object.entries(row)) {
        if (field === "source" || !(field in SHAPE)) continue;
        if (value == null || value === "") continue;
        if (rec[field] == null) rec[field] = value;
      }
    }
  }

  const players = [...byKey.values()];

  // Sort by FantasyPros overall rank when we have it, since that is the base
  // list. With FFB only, fall back to position then rank within position, which
  // at least keeps the file readable.
  players.sort((a, b) => {
    const ar = typeof a.pros_rank === "number" ? a.pros_rank : Infinity;
    const br = typeof b.pros_rank === "number" ? b.pros_rank : Infinity;
    if (ar !== br) return ar - br;
    if (a.pos !== b.pos) return String(a.pos).localeCompare(String(b.pos));
    return (a.ffb_pos_rank ?? Infinity) - (b.ffb_pos_rank ?? Infinity);
  });

  return players;
}

export { FFB_FIELDS, PROS_FIELDS, SHAPE };
