const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  computeGapAnalysis, buildSoloEmail, buildGymEmail,
} = require('./send_certificates_lib');

function makeRow(overrides) {
  return {
    athlete_id: 'RB000', name: 'Test Athlete', category: 'male',
    s1_burpees: 20, s2_bike: 200, s3_lunges: 20, s4_pushups: 20,
    s5_sprint: 5, s6_inchworms: 20, s7_squats: 20,
    total: 500, gender_rank: 50,
    ...overrides,
  };
}

test('computeGapAnalysis returns null when the category has no 30th place', () => {
  const board = [
    makeRow({ gender_rank: 1, total: 900 }),
    makeRow({ gender_rank: 2, total: 800 }),
  ];
  assert.equal(computeGapAnalysis(board[1], board), null);
});

test('computeGapAnalysis computes point gap and worst station vs. the cutoff', () => {
  const top     = makeRow({ gender_rank: 1,  total: 900, s2_bike: 300 });
  const cutoff  = makeRow({ gender_rank: 30, total: 500, s2_bike: 220, s1_burpees: 25 });
  const athlete = makeRow({ gender_rank: 45, total: 460, s2_bike: 150, s1_burpees: 25 });
  const board   = [top, cutoff, athlete];

  const result = computeGapAnalysis(athlete, board);
  assert.equal(result.pointGap, 40);        // 500 - 460
  assert.equal(result.cutoffTotal, 500);
  assert.equal(result.topTotal, 900);
  // s2_bike deficit: (220-150)*1 = 70; s1_burpees deficit: (25-25)*10 = 0 — bike wins
  assert.equal(result.worstStationLabel, 'Erg Bike');
  assert.equal(result.worstStationDeficit, 70);
});

test('buildSoloEmail congratulates a finalist distinctly from a semi-finalist', () => {
  const athleteRow = makeRow({ name: 'Finalist Fox', gender_rank: 3 });
  const record = { athlete: { name: 'Finalist Fox' }, rounds: { '1': {}, '2': {}, '3': {} } };
  const { subject, text } = buildSoloEmail(athleteRow, record, [athleteRow]);
  assert.match(subject, /Finalist Fox/);
  assert.match(text, /Battle 3 — The Finals/);
});

test('buildSoloEmail congratulates a semi-finalist advancing from Battle 1 to Battle 2', () => {
  const athleteRow = makeRow({ name: 'Semi-finalist Sam', gender_rank: 15 });
  const record = { athlete: { name: 'Semi-finalist Sam' }, rounds: { '1': {}, '2': {} } };
  const { subject, text } = buildSoloEmail(athleteRow, record, [athleteRow]);
  assert.match(subject, /Semi-finalist Sam/);
  assert.match(text, /Battle 2 — Semi-Finals/);
  assert.doesNotMatch(text, /Battle 3 — The Finals/);
});

test('buildSoloEmail includes gap analysis for non-qualifiers past rank 30', () => {
  const cutoff  = makeRow({ gender_rank: 30, total: 500 });
  const athlete = makeRow({ name: 'Eliminated Eve', gender_rank: 45, total: 460 });
  const board   = [makeRow({ gender_rank: 1, total: 900 }), cutoff, athlete];
  const record  = { athlete: { name: 'Eliminated Eve' }, rounds: { '1': {} } };
  const { text } = buildSoloEmail(athlete, record, board);
  assert.match(text, /rank 45/);
  assert.match(text, /40 points from the qualifying line/);
});

test('buildSoloEmail skips gap analysis for a rank <=30 athlete with no Battle 2 record', () => {
  // e.g. a DNS/withdrawal — qualified by rank but never started Battle 2.
  const cutoff  = makeRow({ gender_rank: 30, total: 500 });
  const athlete = makeRow({ name: 'Withdrew Wendy', gender_rank: 12, total: 650 });
  const board   = [makeRow({ gender_rank: 1, total: 900 }), cutoff, athlete];
  const record  = { athlete: { name: 'Withdrew Wendy' }, rounds: { '1': {} } };
  const { text } = buildSoloEmail(athlete, record, board);
  assert.doesNotMatch(text, /qualifying line/);
  assert.match(text, /Thank you for battling/);
});

test('buildGymEmail names the team and its score', () => {
  const team = { team_name: 'Iron Pit CrossFit', rank: 2, team_score: 812 };
  const { subject, text } = buildGymEmail(team);
  assert.match(subject, /Iron Pit CrossFit/);
  assert.match(text, /rank 2/);
  assert.match(text, /812/);
});
