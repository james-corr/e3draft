import { normalizeName } from "../../lib/players.js";

/**
 * Fold one or more sources into the players.<season>.json shape.
 *
 * The join key is normalizeName(name) + "|" + pos, reusing the app's own
 * matcher from lib/players.js. That function is the single source of truth for
 * "are these two strings the same player" -- a second, subtly different
 * matcher here is exactly how "D.K. Metcalf" ends up in the file twice.
 *
 * A note on collisions. Two different humans can share a name at a position --
 * FantasyPros 2026 ranks two separate Isaiah Williamses at WR, one a free agent
 * and one on the Jets. They fold into one row here, because the id format is
 * name|pos and two rows would collide on id as well as on key. That is a
 * deliberate limit, not an oversight, and CLAUDE.md rule 1 says it must not be
 * silent: merge reports every collapse through warn() so it shows up on the
 * refresh rather than being discovered on draft day.
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
  eligibility: null,
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
const PROS_FIELDS = ["pros_rank", "pros_tier", "pos_rank_pros", "eligibility", "sos", "ecr_vs_adp"];

const key = (name, pos) => `${normalizeName(name)}|${String(pos || "?").toLowerCase()}`;

/**
 * id keeps the format extract_from_xlsx.py established (raw-lowercased
 * name|pos) so nothing downstream has to change. The normalized key above is
 * used for joining only.
 */
const idOf = (name, pos) => `${String(name).toLowerCase()}|${String(pos || "?").toLowerCase()}`;

export function merge(sources, { warn = () => {} } = {}) {
  const byKey = new Map();
  // Which sources have already claimed each key. A key claimed twice by the
  // SAME source means that source returned two distinct players under one name
  // -- the real collision. Two different sources claiming it is just the outer
  // join working, so tracking by source is what keeps this from crying wolf.
  const claimedBy = new Map();

  for (const rows of sources) {
    for (const row of rows || []) {
      if (!row?.name || !row?.pos) continue;
      const k = key(row.name, row.pos);

      let rec = byKey.get(k);
      if (!rec) {
        rec = { ...SHAPE, name: row.name, pos: row.pos, id: idOf(row.name, row.pos) };
        byKey.set(k, rec);
        claimedBy.set(k, new Set());
      }

      const claims = claimedBy.get(k);
      const from = row.source ?? "?";
      if (claims.has(from)) {
        warn(
          `two different players named "${row.name}" at ${row.pos} in the ${from} pull ` +
            `(kept ${rec.team ?? "?"} ${rec.pos_rank_pros ?? rec.ffb_pos_rank ?? "?"}, ` +
            `dropped ${row.team ?? "?"} ${row.pos_rank_pros ?? row.ffb_pos_rank ?? "?"}) — ` +
            `one row can hold one of them, so a pick typed as this name resolves to the first`
        );
      }
      claims.add(from);

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
