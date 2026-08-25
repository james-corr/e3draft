import { resolvePick, normalizeName } from "./players.js";

/**
 * The whole engine that used to be ~2,500 rows of spreadsheet formulas across
 * two files: who's taken, who's left, how many are left in each tier, what my
 * roster looks like, and where each of my planned targets ended up.
 *
 * It all runs in memory off a 20x12 grid of names and a 676-row player list, so
 * a full recompute is sub-millisecond. That is the entire reason the command
 * center stopped being a Google Sheet.
 */

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "DST", "K", "LB", "DE", "DT", "S", "CB"];
const IDP = new Set(["LB", "DE", "DT", "S", "CB"]);

/**
 * The watchlist vocabulary, carried over verbatim from the tagged-notes table in
 * the old workbook. Stars and tags are one system, not two: a star is "I want
 * him", a tag is "here is why". Both live in the same inventory record.
 */
export const TAGS = ["Breakout", "Sleepers", "Busts", "Late Round Fliers", "My Guys"];

export function computeState({ pool, league, board, inventory, plan }) {
  const { teams, picks } = board;

  // ---- 1. Resolve every typed pick to real players -------------------------
  const takenNorms = new Set();
  const unmatched = [];
  const resolved = [];

  // Keepers are ordinary picks that were typed early; the only thing that makes
  // one a keeper is which cell it sits in, recorded in league.json as
  // coordinates. Stamped on here so the grid doesn't need a second lookup.
  const keeperCells = new Set((league.keepers || []).map((k) => `${k.round}:${k.teamIndex}`));
  const isKeeper = (p) => keeperCells.has(`${p.round}:${p.teamIndex}`);

  for (const pick of picks) {
    const { matched, suggestion, fuzzy } = resolvePick(pool, pick.text);
    if (!matched.length) {
      unmatched.push({ ...pick, suggestion, keeper: isKeeper(pick) });
      continue;
    }
    // A two-way player resolves to several rows; drafting them takes all of them.
    for (const p of matched) takenNorms.add(p.norm);
    const primary = matched[0];
    resolved.push({
      ...pick,
      keeper: isKeeper(pick),
      player: primary,
      fuzzy: Boolean(fuzzy),
      matchedAs: fuzzy ? primary.name : null,
    });
  }

  const isTaken = (p) => takenNorms.has(p.norm);

  // ---- 2. Available pool, grouped by position (the "Best Left" board) ------
  const available = pool.players.filter((p) => !isTaken(p));

  const byPosition = {};
  for (const pos of POSITION_ORDER) byPosition[pos] = [];
  for (const p of available) {
    const pos = p.pos || "?";
    (byPosition[pos] ||= []).push(p);
  }
  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort(
      (a, b) => (num(a.pros_rank) ?? 9999) - (num(b.pros_rank) ?? 9999)
    );
  }

  // ---- 3. Tier counts remaining -------------------------------------------
  // "How many tier-2 RBs are left" — the question that drives whether to reach
  // now or wait a round. Counted for both ranking sources, since they disagree
  // and the disagreement is itself signal.
  const tiers = {};
  for (const pos of Object.keys(byPosition)) {
    const pros = {};
    const ffb = {};
    for (const p of byPosition[pos]) {
      const t1 = p.pros_tier;
      const t2 = p.ffb_tier;
      if (t1 != null) pros[t1] = (pros[t1] || 0) + 1;
      if (t2 != null) ffb[t2] = (ffb[t2] || 0) + 1;
    }
    tiers[pos] = { pros, ffb };
  }

  // ---- 4. Rosters ---------------------------------------------------------
  const rosters = teams.map((t) => ({ team: t, picks: [], counts: {} }));
  for (const r of resolved) {
    const roster = rosters[r.teamIndex];
    if (!roster) continue;
    roster.picks.push({
      round: r.round,
      label: r.label,
      name: r.player.name,
      pos: r.player.pos,
      team: r.player.team,
      bye: r.player.bye,
      ffb_adp: r.player.ffb_adp,
      ffb_tier: r.player.ffb_tier,
      ffb_pos_rank: r.player.ffb_pos_rank,
    });
    const pos = r.player.pos || "?";
    roster.counts[pos] = (roster.counts[pos] || 0) + 1;
  }

  const leagueCounts = {};
  for (const roster of rosters) {
    for (const [pos, n] of Object.entries(roster.counts)) {
      leagueCounts[pos] = (leagueCounts[pos] || 0) + n;
    }
  }

  const myIndex = teams.findIndex(
    (t) => normalizeName(t) === normalizeName(league.myTeam)
  );
  const myRoster = myIndex >= 0 ? rosters[myIndex] : null;

  // ---- 5. Where am I in the draft? ----------------------------------------
  const totalPicks = teams.length * league.rounds;
  const madePicks = resolved.length + unmatched.length;

  // WHICH slots are filled, not how many. A keeper is typed into its own round
  // long before the draft reaches it, so counting picks would put the clock N
  // slots ahead of where a typed pick actually lands — N being the number of
  // keepers. `nextOpen` in lib/picks.js decides where a pick goes by scanning
  // for the first empty cell, and this has to agree with it: a rail announcing
  // one slot while the board fills another is the expensive kind of wrong.
  const filled = new Set();
  for (const p of resolved) filled.add(p.overall);
  for (const p of unmatched) filled.add(p.overall);

  let clockAt = null;
  for (let o = 1; o <= totalPicks; o++) {
    if (!filled.has(o)) {
      clockAt = o;
      break;
    }
  }

  const onTheClock = clockAt ? pickAt(clockAt, teams, league.rounds) : null;
  const myNext =
    myIndex >= 0 ? nextOpenFor(myIndex, clockAt, filled, teams, league.rounds) : null;

  // Who took whom, keyed by normalized name — read by both the branch targets
  // and the watchlist below.
  const takenBy = new Map(resolved.map((r) => [r.player.norm, r]));

  // ---- 6. Contingency branches --------------------------------------------
  // Each branch is a full round-by-round plan. What James needs at a glance is
  // not "is this player gone" but "how much of this plan is still intact".
  const branches = (plan?.branches || []).map((b, bi) => {
    const targets = b.picks.map((t, ti) => {
      const { matched } = resolvePick(pool, t.player);
      const p = matched[0] || null;
      const taken = p ? isTaken(p) : false;
      const took = taken ? takenBy.get(p.norm) : null;
      return {
        // Where this row actually lives on disk. The board edits plans in
        // place, and the rendered name is the RESOLVED name — "gibbs" shows as
        // "Jahmyr Gibbs" — so a name is not an address back into the file.
        index: ti,
        round: t.round,
        name: p ? p.name : t.player,
        raw: t.player,
        pos: p?.pos ?? null,
        team: p?.team ?? null,
        ffb_tier: p?.ffb_tier ?? null,
        ffb_adp: p?.ffb_adp ?? null,
        pros_tier: p?.pros_tier ?? null,
        unknown: !p,
        taken,
        wentAt: took ? took.label : null,
        wentTo: took ? took.team : null,
      };
    });
    const live = targets.filter((t) => !t.taken).length;
    return {
      index: bi,
      id: b.id,
      label: b.label,
      named: b.named,
      targets,
      liveCount: live,
      totalCount: targets.length,
      // The share of the plan still on the board — the number that tells James
      // which branch to actually follow.
      health: targets.length ? Math.round((live / targets.length) * 100) : 0,
    };
  });

  // ---- 7. Inventory (tags + stars, unified) -------------------------------
  // Entries carry the whole player row so the focus card can render a tagged
  // player who has already been drafted — he is gone from `available`, but the
  // reason James was watching him still matters.
  const inv = inventory?.players || {};
  const watchlist = [];
  for (const [id, entry] of Object.entries(inv)) {
    const p = pool.byId.get(id);
    if (!p) continue;
    const took = takenBy.get(p.norm);
    watchlist.push({
      ...p,
      starred: Boolean(entry.starred),
      tags: entry.tags || [],
      note: entry.note || "",
      taken: Boolean(took),
      wentAt: took ? took.label : null,
      wentTo: took ? took.team : null,
    });
  }
  watchlist.sort(
    (a, b) => Number(a.taken) - Number(b.taken) || (num(a.pros_rank) ?? 9999) - (num(b.pros_rank) ?? 9999)
  );

  return {
    updatedAt: new Date().toISOString(),
    league: { teams, rounds: league.rounds, myTeam: league.myTeam, myIndex },
    board: { picks: resolved, unmatched, madePicks, totalPicks, onTheClock, myNext },
    available: { byPosition, total: available.length },
    tiers,
    rosters,
    leagueCounts,
    myRoster,
    recent: resolved.slice(-12).reverse(),
    branches,
    // `index` is where the note lives in the plan on disk. The FIELD screen
    // edits notes in place, and a round number is not an address — two notes
    // can share a round, and an edit that changes the round would move the row
    // out from under itself mid-save.
    notes: (plan?.notes || []).map((n, index) => ({ ...n, index })),
    inventory: watchlist,
    tagVocabulary: TAGS,
    positionOrder: POSITION_ORDER,
    idpPositions: [...IDP],
  };
}

function num(v) {
  return typeof v === "number" ? v : null;
}

/** Overall pick number -> {round, slot, teamIndex} under snake order. */
function pickAt(overall, teams, rounds) {
  const n = teams.length;
  if (overall < 1 || overall > n * rounds) return null;
  const round = Math.ceil(overall / n);
  const slot = overall - (round - 1) * n;
  const teamIndex = round % 2 === 1 ? slot - 1 : n - slot;
  return { overall, round, slot, teamIndex, team: teams[teamIndex], label: `${round}.${String(slot).padStart(2, "0")}` };
}

/**
 * James's next pick, and how many picks happen before he is up.
 *
 * Counts only slots that are still EMPTY. A keeper sitting between here and
 * there is already spent — nobody is waiting through it — so counting it would
 * tell James to expect a longer wait than he has.
 */
function nextOpenFor(teamIndex, from, filled, teams, rounds) {
  if (!from) return null;
  let away = 0;
  for (let o = from; o <= teams.length * rounds; o++) {
    if (filled.has(o)) continue;
    const p = pickAt(o, teams, rounds);
    if (p && p.teamIndex === teamIndex) return { ...p, picksAway: away };
    away++;
  }
  return null;
}
