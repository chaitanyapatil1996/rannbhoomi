// send_certificates_lib.js
// Pure functions for the certificate-email gap analysis and copy — no
// network, filesystem, or Puppeteer here, so these are unit-testable
// directly (see send_certificates_lib.test.js). send_certificates.js is
// the only consumer.

const STATION_POINTS = {
  s1_burpees:   10,
  s2_bike:      1,
  s3_lunges:    10,
  s4_pushups:   5,
  s5_sprint:    20,
  s6_inchworms: 10,
  s7_squats:    5,
};

const STATION_LABELS = {
  s1_burpees:   'Static Burpees',
  s2_bike:      'Erg Bike',
  s3_lunges:    'Deadlift',
  s4_pushups:   'Hand Release Push Ups',
  s5_sprint:    'Sprint with Weights',
  s6_inchworms: 'Inch Worms',
  s7_squats:    'DB Front Squats',
};

// athlete: one Battle 1 leaderboard row. board: every row sharing that
// athlete's category. Returns null when the category has no real 30th
// place to compare against (fewer than 30 finishers).
function computeGapAnalysis(athlete, board) {
  const top    = board.find(r => Number(r.gender_rank) === 1);
  const cutoff = board.find(r => Number(r.gender_rank) === 30);
  if (!top || !cutoff) return null;

  const pointGap = Number(cutoff.total) - Number(athlete.total);

  let worstStation = null;
  let worstDeficit  = -Infinity;
  for (const key of Object.keys(STATION_POINTS)) {
    const athleteVal = Number(athlete[key]) || 0;
    const cutoffVal  = Number(cutoff[key]) || 0;
    const deficit    = (cutoffVal - athleteVal) * STATION_POINTS[key];
    if (deficit > worstDeficit) {
      worstDeficit = deficit;
      worstStation = key;
    }
  }

  return {
    rank:                Number(athlete.gender_rank),
    total:                Number(athlete.total),
    topTotal:             Number(top.total),
    cutoffTotal:          Number(cutoff.total),
    pointGap,
    worstStationLabel:    STATION_LABELS[worstStation],
    worstStationDeficit:  Math.round(worstDeficit),
  };
}

// athleteRow: the athlete's Battle 1 leaderboard row (name, gender_rank, total, category, stations).
// athleteRecord: the full `action=athlete` response — { athlete, rounds }.
// board: every Battle 1 row sharing athleteRow.category (for gap analysis).
function buildSoloEmail(athleteRow, athleteRecord, board) {
  const name    = athleteRow.name;
  const rounds  = (athleteRecord && athleteRecord.rounds) || {};
  const advanced      = !!rounds['2'];
  const reachedFinals = !!rounds['3'];
  const subject = `Your Rannbhoomi 2026 Certificate — ${name}`;

  let body;
  if (reachedFinals) {
    body = `Hi ${name},\n\n`
      + `You made it all the way to Battle 3 — The Finals at Rannbhoomi 2026, one of only 20 athletes (10 male, 10 female) to get there. That's a serious achievement.\n\n`
      + `Your full performance certificate is attached, station by station across every Battle you fought through.\n\n`;
  } else if (advanced) {
    body = `Hi ${name},\n\n`
      + `You battled through Battle 1 — Qualifiers and advanced to Battle 2 — Semi-Finals at Rannbhoomi 2026 — the top tier of everyone who competed.\n\n`
      + `Your full performance certificate is attached.\n\n`;
  } else {
    const gap = Number(athleteRow.gender_rank) > 30 ? computeGapAnalysis(athleteRow, board) : null;
    if (gap) {
      body = `Hi ${name},\n\n`
        + `Thank you for battling at Rannbhoomi 2026. You finished rank ${gap.rank} in Battle 1 — Qualifiers with ${gap.total} points.\n\n`
        + `You were ${gap.pointGap} points from the qualifying line for Battle 2 (30th place finished on ${gap.cutoffTotal} points — the top qualifier in your category finished on ${gap.topTotal}). `
        + `Your biggest opportunity next time: ${gap.worstStationLabel}, where you gave up roughly ${gap.worstStationDeficit} points versus the qualifying line.\n\n`
        + `Your certificate is attached — come back stronger for Season 2.\n\n`;
    } else {
      body = `Hi ${name},\n\n`
        + `Thank you for battling at Rannbhoomi 2026. Your certificate is attached.\n\n`;
    }
  }

  body += `Built by Athletes. For Athletes.\nTeam Rannbhoomi`;
  return { subject, text: body };
}

function buildGymEmail(team) {
  const subject = `Your Rannbhoomi 2026 Gym Battle Certificate — ${team.team_name}`;
  const text = `Hi ${team.team_name},\n\n`
    + `Your Gym Battle result at Rannbhoomi 2026: rank ${team.rank}, team score ${team.team_score}.\n\n`
    + `Your full certificate is attached.\n\n`
    + `Built by Athletes. For Athletes.\nTeam Rannbhoomi`;
  return { subject, text };
}

module.exports = {
  STATION_POINTS, STATION_LABELS,
  computeGapAnalysis, buildSoloEmail, buildGymEmail,
};
