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

export function computeState({ pool, league, board, inventory, plan }) {
  const { teams, picks } = board;

  // ---- 1. Resolve every typed pick to real players -------------------------
  const takenNorms = new Set();
  const unmatched = [];
  const resolved = [];

  for (const pick of picks) {
    const { matched, suggestion, fuzzy } = resolvePick(pool, pick.text);
    if (!matched.length) {
      unmatched.push({ ...pick, suggestion });
      continue;
    }
    // A two-way player resolves to several rows; drafting them takes all of them.
    for (const p of matched) takenNorms.add(p.norm);
    const primary = matched[0];
    resolved.push({
      ...pick,
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
  const onTheClock = pickAt(madePicks + 1, teams, league.rounds);
  const myNext = myIndex >= 0 ? nextPickFor(myIndex, madePicks, teams, league.rounds) : null;

  // ---- 6. Contingency branches --------------------------------------------
  // Each branch is a full round-by-round plan. What James needs at a glance is
  // not "is this player gone" but "how much of this plan is still intact".
  const branches = (plan?.branches || []).map((b) => {
    const targets = b.picks.map((t) => {
      const { matched } = resolvePick(pool, t.player);
      const p = matched[0] || null;
      const taken = p ? isTaken(p) : false;
      const takenBy = taken ? resolved.find((r) => r.player.norm === p.norm) : null;
      return {
        round: t.round,
        name: p ? p.name : t.player,
        pos: p?.pos ?? null,
        team: p?.team ?? null,
        ffb_tier: p?.ffb_tier ?? null,
        ffb_adp: p?.ffb_adp ?? null,
        pros_tier: p?.pros_tier ?? null,
        unknown: !p,
        taken,
        wentAt: takenBy ? takenBy.label : null,
        wentTo: takenBy ? takenBy.team : null,
      };
    });
    const live = targets.filter((t) => !t.taken).length;
    return {
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
  const inv = inventory?.players || {};
  const starred = [];
  for (const [id, entry] of Object.entries(inv)) {
    if (!entry.starred && !(entry.tags || []).length) continue;
    const p = pool.players.find((x) => x.id === id);
    if (!p) continue;
    starred.push({
      id,
      name: p.name,
      pos: p.pos,
      team: p.team,
      bye: p.bye,
      pros_tier: p.pros_tier,
      ffb_tier: p.ffb_tier,
      ffb_adp: p.ffb_adp,
      starred: Boolean(entry.starred),
      tags: entry.tags || [],
      note: entry.note || "",
      taken: isTaken(p),
    });
  }
  starred.sort((a, b) => Number(a.taken) - Number(b.taken) || (num(a.ffb_adp) ?? 99) - (num(b.ffb_adp) ?? 99));

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
    notes: plan?.notes || [],
    inventory: starred,
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

function nextPickFor(teamIndex, madePicks, teams, rounds) {
  for (let o = madePicks + 1; o <= teams.length * rounds; o++) {
    const p = pickAt(o, teams, rounds);
    if (p && p.teamIndex === teamIndex) return { ...p, picksAway: o - madePicks - 1 };
  }
  return null;
}
