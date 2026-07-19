const XLSX = require('./node_modules/xlsx');

const HEADERS = ['Station #', 'Station Name', 'Target', 'Unit', 'Points/Unit', 'M Weight', 'F Weight', 'Notes'];

const battle1 = [
  HEADERS,
  [1, 'Static Burpees',          'Max', 'reps',  10, 'Bodyweight',  'Bodyweight', ''],
  [2, 'Erg Bike',                'Max (2 min)', 'metres', 1, '—', '—', ''],
  [3, 'Deadlift',                'Max', 'reps',  10, '50kg',        '30kg',       ''],
  [4, 'Hand Release Push Ups',   'Max', 'reps',  5,  'Bodyweight',  'Bodyweight', ''],
  [5, 'Sprint with Weights',     'Max', 'laps',  20, '15kg x2',     '10kg x2',    ''],
  [6, 'Inch Worms',              'Max', 'reps',  10, 'Bodyweight',  'Bodyweight', ''],
  [7, 'DB Front Squats',         'Max', 'reps',  5,  '12.5kg x2',   '5kg x2',     ''],
];

const battle2 = [
  HEADERS,
  [1, 'Rowing',           500, 'metres', 'Progress-based (see Battle 2 rules)', '—',        '—',       'Fixed target per round; not a points formula'],
  [2, "Devil's Press",    12,  'reps',   'Progress-based (see Battle 2 rules)', '10kg x2',  '5kg x2',  ''],
  [3, 'KB Walk',          100, 'metres', 'Progress-based (see Battle 2 rules)', '12kg x2',  '8kg x2',  ''],
  [4, 'Burpee Box Jump',  10,  'reps',   'Progress-based (see Battle 2 rules)', '24in box', '20in box',''],
];

const battle3 = [
  HEADERS,
  [1, 'Single Arm Snatch',        40,  'reps',    'reps x weight used (kg)', 'Athlete-selected, recorded manually', 'Athlete-selected, recorded manually', 'Weight logged on paper per athlete, entered into system with reps. Example: 30kg x 40 reps = 1200 pts'],
  [2, 'Sled Push',                4,   'laps',    'weight used (kg) x laps', 'Athlete-selected, recorded manually', 'Athlete-selected, recorded manually', 'Example: 200kg x 4 laps = 800 pts'],
  [3, 'Ski',                      'Max (4 min cap)', 'metres', '1 pt/metre',  '—', '—', 'Fixed 4-minute time cap; score = distance covered. Example: 800m = 800 pts'],
  [4, 'Box Step Up with Weights', 40,  'reps',    '10 pts/rep (fixed)',       'Recorded for reference only (not scored)', 'Recorded for reference only (not scored)', 'Weight does not affect score; 40 reps x 10 = 400 pts fixed if completed'],
  [5, 'Sandbag Back Throw',       'Max', 'reps',  '10 pts/rep',               '50kg (fixed)', '30kg (fixed)', 'Max reps at fixed gender weight'],
];

const gymBattle = [
  HEADERS,
  [1, 'Front Squats',      'Max',      'reps',     '10 pts/rep (accumulated)', '15kg x2', '10kg x2', ''],
  [2, "Devil's Press",     'Max',      'reps',     '10 pts/rep (accumulated)', '15kg x2', '7.5kg x2', ''],
  [3, 'Rower',             'Max',      'metres',   '1 pt/metre (accumulated)', '—',    '—',    ''],
  [4, 'Burpee Box Jumps',  'Max',      'reps',     '10 pts/rep (accumulated)', '24in box', '20in box', ''],
  [5, 'KB Hold',           'Max time', 'seconds',  'Not scored',                          '24kg', '16kg', 'Gates rotation only — does not count toward team score'],
];

// ─── Event Timeline ──────────────────────────────────────────────────────────
// Assumptions (see Notes column per row):
// - Battle 1: 300 total athletes, 4 zones x 7 athletes/heat = 28/heat -> 11 heats.
//   Each heat = 7 stations x (2:00 on + 0:30 off) = 17.5 min. No heat-to-heat
//   athlete changeover time included (flagged as a gap).
// - Battle 2: 30 M in one zone + 30 F in the other zone, both run a single
//   20-min session simultaneously -> 20 min total, not per-athlete/heat.
// - Gym Battle: 10 teams / 4 zones = 3 sequential waves (4+4+2) x 20 min = 60 min.
// - Battle 3 and Breaks are fixed inputs, not derived.

const timelineRows = [
  ['Segment', 'Detail', 'Duration (min)', 'Duration (h:m)', 'Cumulative End', 'Notes'],
  ['Battle 1 — Qualifiers', '300 athletes, 4 zones x 7/heat, 11 heats x 17.5 min', 192.5, '3h 12.5m', '3h 12.5m', 'Excludes heat-to-heat athlete changeover time — confirm if a buffer is needed'],
  ['Battle 2 — Semi-Finals', '30 M zone + 30 F zone, single 20-min session, parallel', 20, '0h 20m', '3h 32.5m', 'Both zones run concurrently, so this adds only 20 min, not per-heat'],
  ['Gym Battle', '10 teams / 4 zones, 3 waves x 20 min', 60, '1h 00m', '4h 32.5m', 'Waves: 4 teams, 4 teams, 2 teams'],
  ['Battle 3 — Finals', 'Fixed estimate, pen-and-paper scoring', 120, '2h 00m', '6h 32.5m', 'Given directly, not derived from station-level timing'],
  ['Breaks / Refreshments', 'Total across the day', 180, '3h 00m', '9h 32.5m', 'Given directly — distribute across the day as needed, not modeled per-slot'],
  ['TOTAL', '', 572.5, '9h 32.5m', '', ''],
];

const wb = XLSX.utils.book_new();

function addSheet(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 10 },
    { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, name);
}

addSheet('Battle 1', battle1);
addSheet('Battle 2', battle2);
addSheet('Battle 3', battle3);
addSheet('Gym Battle', gymBattle);

const timelineWs = XLSX.utils.aoa_to_sheet(timelineRows);
timelineWs['!cols'] = [
  { wch: 24 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 55 },
];
XLSX.utils.book_append_sheet(wb, timelineWs, 'Event Timeline');

XLSX.writeFile(wb, 'Rannbhoomi Scoring Table 2026.xlsx');
console.log('Written: Rannbhoomi Scoring Table 2026.xlsx');
