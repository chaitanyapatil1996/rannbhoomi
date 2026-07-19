const SPREADSHEET_ID = '1KX7BtTBFBJkLW_Chl1Xi_WdWLjqUjUotZGrGQU3g9u8';

const STATION_ROUNDS = {
  '1': ['s1_burpees','s2_bike','s3_lunges','s4_pushups','s5_sprint','s6_inchworms','s7_squats'],
  '2': ['rowing','devils_press','kb_walk','box_jump'],
  '3': ['weight_total','time_seconds'],
};

const SCORE_SHEETS  = { '1':'Round1_Scores',       '2':'Round2_Scores',       '3':'Round3_Scores'       };
const CACHE_SHEETS  = { '1':'Leaderboard_Cache_R1', '2':'Leaderboard_Cache_R2', '3':'Leaderboard_Cache_R3' };

const JUDGES_SHEET        = 'Judges';
const SCORING_TABLE_SHEET = 'Scoring Table';
const ROUND2_SCORES_SHEET = 'Round2_Scores';
const BATTLE2_STATIONS    = [['rowing','Rowing'], ['devils_press',"Devil's Press"], ['kb_walk','KB Walk'], ['box_jump','Burpee Box Jump']];

const GYM_LIVE_SHEET    = 'Gym_Live';
const GYM_RESULTS_SHEET = 'Gym_Results';
const GYM_STATIONS      = [['front_squats','Front Squats'], ['devils_press',"Devil's Press"], ['rower','Rower'], ['box_jump','Burpee Box Jump']];
const GYM_ZONES         = ['1','2','3','4'];

// ─── Routing ────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'scores')           return getScores(e);
  if (action === 'validate_athlete') return validateAthlete(e);
  if (action === 'athlete')          return getAthlete(e);
  if (action === 'analytics')        return getAnalytics(e);
  if (action === 'judge_login')      return judgeLogin(e);
  if (action === 'battle2_roster')   return battle2Roster(e);
  if (action === 'battle2_status')   return battle2Status(e);
  if (action === 'battle2_scores')   return battle2Scores(e);
  if (action === 'gym_scores')       return gymScores(e);
  if (action === 'gym_zone_status')  return gymZoneStatus(e);
  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  if (action === 'register')          return handleRegistration(body);
  if (action === 'score')             return handleScore(body);
  if (action === 'release_wave')      return releaseWave(body);
  if (action === 'admin_clear')       return clearAllScores(body);
  if (action === 'set_release_all')   return setReleaseAll(body);
  if (action === 'rebuild_leaderboard') return adminRebuild(body);
  if (action === 'battle2_start')        return battle2Start(body);
  if (action === 'battle2_station_done') return battle2StationDone(body);
  if (action === 'battle2_partial')      return battle2Partial(body);
  if (action === 'battle2_whistle')      return battle2Whistle(body);
  if (action === 'gym_start_team')       return gymStartTeam(body);
  if (action === 'gym_add_score')        return gymAddScore(body);
  if (action === 'gym_rotate')           return gymRotate(body);
  if (action === 'gym_submit_rotation')  return gymSubmitRotation(body);
  if (action === 'battle3_submit')       return battle3Submit(body);
  return jsonResponse({ error: 'Unknown action' });
}

// ─── Judge PIN lookup (shared by all battles) ────────────────────────────────

function _lookupJudge(pin) {
  if (!pin) return null;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(JUDGES_SHEET);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const row = data.find((r, i) => i > 0 && String(r[0]) === String(pin));
  if (!row) return null;
  const judge = {};
  headers.forEach((h, i) => { judge[h] = row[i]; });
  return judge;
}

function judgeLogin(e) {
  const judge = _lookupJudge(e.parameter.pin);
  if (!judge) return jsonResponse({ found: false });
  return jsonResponse({ found: true, judge });
}

// ─── Scoring Table lookup (Battle/Station -> target, unit, points) ──────────

function _getScoringRow(battle, stationKey) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SCORING_TABLE_SHEET);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const row = data.find((r, i) => i > 0 && String(r[0]) === String(battle) && String(r[1]) === String(stationKey));
  if (!row) return null;
  return { battle: row[0], stationKey: row[1], stationName: row[2], target: row[3], unit: row[4], pointsPerUnit: row[5], mWeight: row[6], fWeight: row[7], notes: row[8] };
}

// ─── Config helpers ──────────────────────────────────────────────────────────

function getConfig(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const cfg = {};
  data.forEach(r => { if (r[0]) cfg[String(r[0])] = r[1]; });
  return cfg;
}

// ─── Registration ────────────────────────────────────────────────────────────

function handleRegistration(body) {
  const { name, email, phone, category } = body;
  if (!name || !email || !category) return jsonResponse({ error: 'Missing required fields' });
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Registrations');
  const regId = 'RB' + Date.now().toString().slice(-6);
  sheet.appendRow([regId, name, email, phone || '', category, '', new Date().toISOString(), 'pending']);
  return jsonResponse({ success: true, reg_id: regId });
}

// ─── Score submission (single-station model) ─────────────────────────────────
//
// Each judge POSTs one station value at a time:
// { action:'score', pin, round, zone, station:'s1_burpees', athlete_id:'RB001', value:45 }
//
// The backend finds (or creates) the athlete row and writes to that one column.
// When all station columns for the round are filled, it computes and stores the total.

function handleScore(body) {
  const { pin, round, station, athlete_id, value } = body;
  if (!pin || !round || !station || !athlete_id) return jsonResponse({ error: 'Missing required fields' });

  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== String(round)) return jsonResponse({ error: 'Invalid PIN for this round' });
  if (String(round) === '1' && String(judge.station) !== String(station)) {
    return jsonResponse({ error: 'This PIN is not assigned to station ' + station });
  }
  const zone = judge.assignment || '';

  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);

  if (String(round) !== String(cfg['active_round']))  return jsonResponse({ error: `Round ${round} is not active. Active: ${cfg['active_round']}` });

  const sheetName     = SCORE_SHEETS[String(round)];
  if (!sheetName) return jsonResponse({ error: 'Invalid round' });

  const roundStations = STATION_ROUNDS[String(round)] || [];
  if (!roundStations.includes(station)) return jsonResponse({ error: 'Unknown station: ' + station });

  // Serialize all writes to prevent race conditions with simultaneous judges
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry in a moment' }); }

  try {
    const sheet      = ss.getSheetByName(sheetName);
    const data       = sheet.getDataRange().getValues();
    const headers    = data[0];
    const stationCol = headers.indexOf(station);
    if (stationCol === -1) return jsonResponse({ error: 'Station column not found in sheet: ' + station });

    const existingIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(athlete_id));

    if (existingIdx > 0) {
      sheet.getRange(existingIdx + 1, stationCol + 1).setValue(Number(value) || 0);
    } else {
      const athleteSheet = ss.getSheetByName('Athletes');
      const athleteData  = athleteSheet.getDataRange().getValues();
      const athlete      = athleteData.find((r, i) => i > 0 && String(r[0]) === String(athlete_id));
      const name     = athlete ? athlete[1] : 'Unknown';
      const category = athlete ? String(athlete[3]).toLowerCase() : '';
      const wave     = athlete ? athlete[4] : '';

      const newRow = new Array(headers.length).fill('');
      const set = (h, v) => { const i = headers.indexOf(h); if (i > -1) newRow[i] = v; };
      set('athlete_id', athlete_id);
      set('name',       name);
      set('category',   category);
      set('wave',       wave);
      set('zone',       zone || '');
      set('complete',   false);
      newRow[stationCol] = Number(value) || 0;
      sheet.appendRow(newRow);
    }

    // Re-read to check if all stations are now filled → compute total
    const fresh  = sheet.getDataRange().getValues();
    const freshH = fresh[0];
    const rowIdx = fresh.findIndex((r, i) => i > 0 && String(r[0]) === String(athlete_id));
    if (rowIdx > 0) {
      const row         = fresh[rowIdx];
      const stationIdxs = roundStations.map(s => freshH.indexOf(s)).filter(i => i > -1);
      const vals        = stationIdxs.map(i => row[i]);
      const allFilled   = vals.every(v => v !== '' && v !== null && v !== undefined);
      // Battle 1 applies the per-station points multiplier from the Scoring Table.
      // Other rounds keep a raw sum (their placeholder columns aren't points-weighted yet).
      const total = String(round) === '1'
        ? roundStations.reduce((sum, st, i) => {
            const scoring = _getScoringRow('1', st);
            const pts = scoring ? Number(scoring.pointsPerUnit) || 0 : 1;
            return sum + (Number(vals[i]) || 0) * pts;
          }, 0)
        : vals.reduce((sum, v) => sum + (Number(v) || 0), 0);
      const setCell     = (h, v) => { const i = freshH.indexOf(h); if (i > -1) sheet.getRange(rowIdx + 1, i + 1).setValue(v); };
      setCell('complete',     allFilled);
      setCell('submitted_at', new Date().toISOString());
      if (allFilled) setCell('total', total);
    }

    return jsonResponse({ success: true, athlete_id, station, value: Number(value) || 0 });

  } finally {
    lock.releaseLock();
  }
}

// ─── Public leaderboard ───────────────────────────────────────────────────────
// Reads from pre-built cache sheets (fast). Cache is rebuilt by rebuildLeaderboard().

function getScores(e) {
  const round    = e.parameter.round || '1';
  const category = (e.parameter.category || '').toLowerCase();
  const cacheName = CACHE_SHEETS[round];
  if (!cacheName) return jsonResponse({ error: 'Invalid round' });

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(cacheName);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ round, category, scores: [], last_updated: null, message: 'Scores not yet released for this battle.' });
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const catIdx  = headers.indexOf('category');

  const scores = data.slice(1)
    .filter(r => r[0] && (!category || String(r[catIdx]).toLowerCase() === category))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h !== '') obj[h] = r[i]; });
      return obj;
    });

  return jsonResponse({ round, category, scores, last_updated: new Date().toISOString() });
}

// ─── Athlete lookups ──────────────────────────────────────────────────────────

// Quick lookup used by judge portal to confirm an athlete ID before scoring
function validateAthlete(e) {
  const id = e.parameter.athlete_id;
  if (!id) return jsonResponse({ error: 'No athlete_id provided' });

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Athletes');
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const row   = data.find((r, i) => i > 0 && String(r[0]) === String(id));
  if (!row) return jsonResponse({ found: false });

  const athlete = {};
  headers.forEach((h, i) => { athlete[h] = row[i]; });
  return jsonResponse({ found: true, athlete });
}

// Full athlete detail — all rounds + per-station breakdown — used by leaderboard modal
function getAthlete(e) {
  const id = e.parameter.athlete_id;
  if (!id) return jsonResponse({ error: 'No athlete_id provided' });

  const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const athleteData  = athleteSheet.getDataRange().getValues();
  const athleteH     = athleteData[0];
  const athleteRow   = athleteData.find((r, i) => i > 0 && String(r[0]) === String(id));
  if (!athleteRow) return jsonResponse({ error: 'Athlete not found' });

  const athlete = {};
  athleteH.forEach((h, i) => { athlete[h] = athleteRow[i]; });

  const rounds = {};
  Object.keys(SCORE_SHEETS).forEach(round => {
    const sheet = ss.getSheetByName(SCORE_SHEETS[round]);
    if (!sheet) return;
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const row     = data.find((r, i) => i > 0 && String(r[0]) === String(id));
    if (row) {
      const scores = {};
      headers.forEach((h, i) => { if (h) scores[h] = row[i]; });
      rounds[round] = scores;
    }
  });

  return jsonResponse({ athlete, rounds });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function getAnalytics(e) {
  const round = e.parameter.round || '1';
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SCORE_SHEETS[round]);
  if (!sheet) return jsonResponse({ error: 'Invalid round' });

  const data        = sheet.getDataRange().getValues();
  const headers     = data[0];
  const completeIdx = headers.indexOf('complete');
  const catIdx      = headers.indexOf('category');
  const totalIdx    = headers.indexOf('total');
  const stations    = STATION_ROUNDS[String(round)] || [];
  const done        = data.slice(1).filter(r => r[0] && r[completeIdx] === true);

  // Per-station top 3
  const stationChampions = {};
  stations.forEach(st => {
    const col = headers.indexOf(st);
    if (col === -1) return;
    stationChampions[st] = done
      .map(r => ({ athlete_id: r[0], name: r[1], category: r[catIdx], value: Number(r[col]) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  });

  // Category averages
  const categoryAverages = {};
  ['male', 'female'].forEach(cat => {
    const rows = done.filter(r => String(r[catIdx]).toLowerCase() === cat);
    if (!rows.length) return;
    const avgs = {};
    stations.forEach(st => {
      const col = headers.indexOf(st);
      if (col === -1) return;
      const vals = rows.map(r => Number(r[col]) || 0);
      avgs[st] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    });
    categoryAverages[cat] = avgs;
  });

  // Combined ranking — sum of totals across all rounds
  const athleteTotals = {};
  Object.keys(SCORE_SHEETS).forEach(r => {
    const s = ss.getSheetByName(SCORE_SHEETS[r]);
    if (!s) return;
    const d = s.getDataRange().getValues();
    const h = d[0];
    const tIdx = h.indexOf('total');
    const cIdx = h.indexOf('complete');
    const catI = h.indexOf('category');
    d.slice(1).filter(row => row[0] && row[cIdx] === true).forEach(row => {
      const aid = String(row[0]);
      if (!athleteTotals[aid]) athleteTotals[aid] = { athlete_id: aid, name: row[1], category: row[catI], r1: 0, r2: 0, r3: 0 };
      athleteTotals[aid][`r${r}`] = Number(row[tIdx]) || 0;
    });
  });
  const combinedRanking = Object.values(athleteTotals)
    .map(a => ({ ...a, combined_total: a.r1 + a.r2 + a.r3 }))
    .filter(a => a.combined_total > 0)
    .sort((a, b) => b.combined_total - a.combined_total)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  return jsonResponse({ round, station_champions: stationChampions, category_averages: categoryAverages, combined_ranking: combinedRanking });
}

// ─── Wave release ─────────────────────────────────────────────────────────────
// Called by head judge: POST { action:'release_wave', pin:'...', wave:'1' }
// Adds wave to Config 'released_waves', then immediately rebuilds the leaderboard cache.

function releaseWave(body) {
  const { pin, wave } = body;
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  if (String(pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });

  const configSheet = ss.getSheetByName('Config');
  const data        = configSheet.getDataRange().getValues();
  const rowIdx      = data.findIndex(r => r[0] === 'released_waves');
  const current     = rowIdx > -1 ? String(data[rowIdx][1] || '') : '';
  const waves       = current ? current.split(',').map(w => w.trim()).filter(Boolean) : [];

  if (!waves.includes(String(wave))) {
    waves.push(String(wave));
    if (rowIdx > -1) {
      configSheet.getRange(rowIdx + 1, 2).setValue(waves.join(','));
    } else {
      configSheet.appendRow(['released_waves', waves.join(',')]);
    }
  }

  rebuildLeaderboard();
  return jsonResponse({ success: true, released_waves: waves });
}

// ─── Leaderboard cache rebuild ────────────────────────────────────────────────
// Set up as a time-driven trigger (every 1 minute) via Apps Script → Triggers.
// Also called directly by releaseWave() for immediate effect.
//
// Reads each Round_Scores sheet, keeps only complete rows from released waves,
// sorts by total descending, and writes a ranked snapshot to Leaderboard_Cache_R{n}.

function rebuildLeaderboard() {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  const releaseAll    = String(cfg['release_all'] || '').toLowerCase() === 'true';
  const releasedWaves = String(cfg['released_waves'] || '').split(',').map(w => w.trim()).filter(Boolean);

  Object.keys(SCORE_SHEETS).forEach(round => {
    const rawSheet = ss.getSheetByName(SCORE_SHEETS[round]);
    if (!rawSheet || rawSheet.getLastRow() <= 1) return;

    const data        = rawSheet.getDataRange().getValues();
    const headers     = data[0];
    const waveIdx     = headers.indexOf('wave');
    const completeIdx = headers.indexOf('complete');
    const totalIdx    = headers.indexOf('total');
    const catIdx      = headers.indexOf('category');

    const validRows = data.slice(1).filter(r => {
      if (!r[0]) return false;
      if (r[completeIdx] !== true) return false;
      // release_all = TRUE → show every complete row immediately
      if (releaseAll) return true;
      // Otherwise only show rows from manually released waves
      if (releasedWaves.length === 0) return false;
      if (waveIdx > -1 && !releasedWaves.includes(String(r[waveIdx]))) return false;
      return true;
    });

    // Overall rank (all categories combined, by total score) — used by the
    // existing combined leaderboard display.
    validRows.sort((a, b) => (Number(b[totalIdx]) || 0) - (Number(a[totalIdx]) || 0));

    // Gender-scoped rank (by total score, within category only) — Battle 1's
    // global rank interleaves male/female, which isn't what "top 30 male"
    // means for Battle 2's roster. Computed separately so it doesn't disturb
    // the existing global `rank` column.
    const genderRankMap = new Map();
    ['male', 'female'].forEach(cat => {
      const rows = validRows.filter(r => catIdx > -1 && String(r[catIdx]).toLowerCase() === cat);
      rows.sort((a, b) => (Number(b[totalIdx]) || 0) - (Number(a[totalIdx]) || 0));
      rows.forEach((row, i) => genderRankMap.set(row, i + 1));
    });

    const cacheName = CACHE_SHEETS[round];
    let cacheSheet  = ss.getSheetByName(cacheName);
    if (!cacheSheet) {
      cacheSheet = ss.insertSheet(cacheName);
    } else {
      cacheSheet.clearContents();
    }

    cacheSheet.appendRow(['rank', 'gender_rank', ...headers]);
    validRows.forEach((row, i) => cacheSheet.appendRow([i + 1, genderRankMap.get(row) || '', ...row]));
  });
}

// ─── Admin: clear all scores ──────────────────────────────────────────────────
// Wipes every data row from all score sheets and cache sheets,
// then resets released_waves in Config. Headers are preserved.
// Called via POST { action:'admin_clear', pin:'...' }
// or run directly from the Apps Script editor for a manual wipe.

function clearAllScores(body) {
  if (body) {
    const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
    const cfg = getConfig(ss);
    if (String(body.pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Clear all score sheets (keep header row)
  const allSheets = [...Object.values(SCORE_SHEETS), ...Object.values(CACHE_SHEETS)];
  allSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  });

  // Reset released_waves in Config (keep active_round and release_all intact)
  const configSheet = ss.getSheetByName('Config');
  if (configSheet) {
    const data   = configSheet.getDataRange().getValues();
    const rowIdx = data.findIndex(r => r[0] === 'released_waves');
    if (rowIdx > -1) configSheet.getRange(rowIdx + 1, 2).setValue('');
  }

  return jsonResponse({ success: true, message: 'All scores cleared.' });
}

// ─── Admin: set release_all flag ─────────────────────────────────────────────

function setReleaseAll(body) {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  if (String(body.pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });

  const value       = String(body.value || 'true').toLowerCase();
  const configSheet = ss.getSheetByName('Config');
  const data        = configSheet.getDataRange().getValues();
  const rowIdx      = data.findIndex(r => r[0] === 'release_all');
  if (rowIdx > -1) {
    configSheet.getRange(rowIdx + 1, 2).setValue(value === 'true' ? 'TRUE' : 'FALSE');
  } else {
    configSheet.appendRow(['release_all', value === 'true' ? 'TRUE' : 'FALSE']);
  }
  rebuildLeaderboard();
  return jsonResponse({ success: true, release_all: value });
}

// ─── Admin: manual leaderboard rebuild ───────────────────────────────────────

function adminRebuild(body) {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  if (String(body.pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });
  rebuildLeaderboard();
  return jsonResponse({ success: true });
}

// ─── Battle 2 — round/station grid (no stopwatch) ────────────────────────────
//
// Round2_Scores: one row per (athlete, round). Each of the 4 station columns
// is filled with its fixed target once the judge taps STATION DONE; the one
// station live when the whistle blows gets a manual partial value instead.
// heat_finished marks the athlete's final row once the whistle ends their heat.

// Read-only state check — no writes. Lets the judge UI resync itself after a
// fetch failure (e.g. the write actually succeeded but the response never
// arrived) instead of leaving stale state on screen.
function battle2Status(e) {
  const athlete_id = e.parameter.athlete_id;
  if (!athlete_id) return jsonResponse({ error: 'athlete_id required' });
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
  if (!sheet) return jsonResponse({ active: false });
  const open = _battle2FindOpenRow(sheet, athlete_id);
  if (!open) return jsonResponse({ active: false });
  const state = _battle2RowToState(open.row, open.headers);
  const cumulative = _battle2CumulativeTotals(sheet, athlete_id);
  return jsonResponse({ active: true, round: state.round, stationsFilled: state.stationsFilled, cumulative: cumulative.totals, roundsCompleted: cumulative.roundsCompleted });
}

function battle2Roster(e) {
  const gender = (e.parameter.gender || '').toLowerCase();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CACHE_SHEETS['1']);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ athletes: [] });
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const catIdx  = headers.indexOf('category');
  const idIdx   = headers.indexOf('athlete_id');
  const nameIdx = headers.indexOf('name');
  const rankIdx = headers.indexOf('gender_rank');

  const athletes = data.slice(1)
    .filter(r => r[idIdx] && (!gender || String(r[catIdx]).toLowerCase() === gender))
    .sort((a, b) => Number(a[rankIdx]) - Number(b[rankIdx]))
    .slice(0, 30)
    .map(r => ({ athlete_id: r[idIdx], name: r[nameIdx], rank: r[rankIdx] }));

  return jsonResponse({ athletes });
}

function _battle2FindOpenRow(sheet, athlete_id) {
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const finishedIdx = headers.indexOf('heat_finished');
  for (let i = data.length - 1; i > 0; i--) {
    if (String(data[i][0]) === String(athlete_id) && data[i][finishedIdx] !== true) {
      return { rowIndex: i + 1, row: data[i], headers };
    }
  }
  return null;
}

// Converts a Round2_Scores row into the {round, stationsFilled} shape the
// judge UI renders from — used so every endpoint can return true server
// state instead of the client having to assume what happened.
function _battle2RowToState(row, headers) {
  const stationsFilled = {};
  BATTLE2_STATIONS.forEach(([key]) => {
    const v = row[headers.indexOf(key)];
    if (v !== '' && v !== undefined && v !== null) stationsFilled[key] = v;
  });
  return { round: Number(row[headers.indexOf('round')]) || 1, stationsFilled };
}

// Sums each station's value across every row an athlete has (all rounds,
// including a whistle-interrupted partial), plus how many rounds fully
// completed. This is what the judge screen displays — running totals that
// keep growing round over round, rather than resetting to blank each round.
function _battle2CumulativeTotals(sheet, athlete_id) {
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const completeIdx = headers.indexOf('round_complete');
  const totals = {};
  BATTLE2_STATIONS.forEach(([key]) => { totals[key] = 0; });
  let roundsCompleted = 0;

  data.slice(1).forEach(r => {
    if (String(r[0]) !== String(athlete_id)) return;
    BATTLE2_STATIONS.forEach(([key]) => {
      const v = r[headers.indexOf(key)];
      if (v !== '' && v !== undefined && v !== null) totals[key] += Number(v) || 0;
    });
    if (r[completeIdx] === true) roundsCompleted++;
  });

  return { totals, roundsCompleted };
}

function battle2Start(body) {
  const { pin, athlete_id } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '2') return jsonResponse({ error: 'Invalid PIN' });
  if (!athlete_id) return jsonResponse({ error: 'athlete_id required' });

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const athleteData  = athleteSheet.getDataRange().getValues();
  const athlete = athleteData.find((r, i) => i > 0 && String(r[0]) === String(athlete_id));
  if (!athlete) return jsonResponse({ error: 'Athlete not found' });
  const name = athlete[1];
  const category = String(athlete[3] || '').toLowerCase();

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);

    // If this athlete already has an in-progress heat — e.g. a prior START
    // succeeded server-side but the judge's device never saw the response
    // (dropped connection, backgrounded app) — resume showing it instead of
    // blocking with a dead-end error.
    const existingOpen = _battle2FindOpenRow(sheet, athlete_id);
    if (existingOpen) {
      const state = _battle2RowToState(existingOpen.row, existingOpen.headers);
      const cumulative = _battle2CumulativeTotals(sheet, athlete_id);
      return jsonResponse({ success: true, resumed: true, athlete_id, name, category, round: state.round, stationsFilled: state.stationsFilled, cumulative: cumulative.totals, roundsCompleted: cumulative.roundsCompleted });
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = new Array(headers.length).fill('');
    const set = (h, v) => { const i = headers.indexOf(h); if (i > -1) row[i] = v; };
    set('athlete_id', athlete_id);
    set('name', name);
    set('category', category);
    set('round', 1);
    set('round_complete', false);
    set('heat_finished', false);
    set('updated_at', new Date().toISOString());
    sheet.appendRow(row);
    const emptyTotals = {};
    BATTLE2_STATIONS.forEach(([key]) => { emptyTotals[key] = 0; });
    return jsonResponse({ success: true, resumed: false, athlete_id, name, category, round: 1, stationsFilled: {}, cumulative: emptyTotals, roundsCompleted: 0 });
  } finally {
    lock.releaseLock();
  }
}

function battle2StationDone(body) {
  const { pin, athlete_id } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '2') return jsonResponse({ error: 'Invalid PIN' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
    const open = _battle2FindOpenRow(sheet, athlete_id);
    if (!open) return jsonResponse({ error: 'No active heat found for this athlete' });

    const nextStation = BATTLE2_STATIONS.find(([key]) => open.row[open.headers.indexOf(key)] === '');
    let stationLogged = null, valueLogged = null;

    if (nextStation) {
      const [key] = nextStation;
      const scoring = _getScoringRow('2', key);
      const target = scoring ? Number(scoring.target) || 0 : 0;
      sheet.getRange(open.rowIndex, open.headers.indexOf(key) + 1).setValue(target);
      sheet.getRange(open.rowIndex, open.headers.indexOf('updated_at') + 1).setValue(new Date().toISOString());
      stationLogged = key;
      valueLogged = target;
    }

    // Checked unconditionally (not just when this call filled a station) —
    // if a prior close-out attempt failed partway (e.g. a schema mismatch
    // mid-write), the row can already be fully filled with nothing logged
    // this call. Re-checking here means retrying "ROUND COMPLETE" actually
    // closes the round instead of silently doing nothing.
    const fresh = sheet.getRange(open.rowIndex, 1, 1, open.headers.length).getValues()[0];
    const allFilled = BATTLE2_STATIONS.every(([k]) => fresh[open.headers.indexOf(k)] !== '');
    if (allFilled) {
      sheet.getRange(open.rowIndex, open.headers.indexOf('round_complete') + 1).setValue(true);
      // Close this row out explicitly — otherwise it and the newly
      // appended round both have heat_finished=false, and any ambiguity
      // in which one is "the open row" leads to the UI getting stuck
      // showing the just-completed round instead of advancing.
      sheet.getRange(open.rowIndex, open.headers.indexOf('heat_finished') + 1).setValue(true);
      const newRow = new Array(open.headers.length).fill('');
      const set = (h, v) => { const i = open.headers.indexOf(h); if (i > -1) newRow[i] = v; };
      set('athlete_id', fresh[open.headers.indexOf('athlete_id')]);
      set('name', fresh[open.headers.indexOf('name')]);
      set('category', fresh[open.headers.indexOf('category')]);
      set('round', Number(fresh[open.headers.indexOf('round')]) + 1);
      set('round_complete', false);
      set('heat_finished', false);
      set('updated_at', new Date().toISOString());
      sheet.appendRow(newRow);
    }

    // Re-read whatever this athlete's current open row is now (same row, or
    // the freshly auto-created next round) so the response always reflects
    // true server state rather than an assumption about what just happened.
    const after = _battle2FindOpenRow(sheet, athlete_id);
    const state = after ? _battle2RowToState(after.row, after.headers) : { round: null, stationsFilled: {} };
    const cumulative = _battle2CumulativeTotals(sheet, athlete_id);

    return jsonResponse({
      success: true,
      station: stationLogged,
      value: valueLogged,
      round_complete: stationLogged !== null && Object.keys(state.stationsFilled).length === 0,
      round: state.round,
      stationsFilled: state.stationsFilled,
      cumulative: cumulative.totals,
      roundsCompleted: cumulative.roundsCompleted,
    });
  } finally {
    lock.releaseLock();
  }
}

// Judge types the actual partial count/distance when the whistle catches the athlete mid-station.
function battle2Partial(body) {
  const { pin, athlete_id, value } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '2') return jsonResponse({ error: 'Invalid PIN' });
  if (value === undefined || value === null || value === '') return jsonResponse({ error: 'Value required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
    const open = _battle2FindOpenRow(sheet, athlete_id);
    if (!open) return jsonResponse({ error: 'No active heat found for this athlete' });

    const nextStation = BATTLE2_STATIONS.find(([key]) => open.row[open.headers.indexOf(key)] === '');
    if (!nextStation) return jsonResponse({ error: 'Round already fully logged — use WHISTLE instead' });
    const [key] = nextStation;

    sheet.getRange(open.rowIndex, open.headers.indexOf(key) + 1).setValue(Number(value) || 0);
    sheet.getRange(open.rowIndex, open.headers.indexOf('heat_finished') + 1).setValue(true);
    sheet.getRange(open.rowIndex, open.headers.indexOf('updated_at') + 1).setValue(new Date().toISOString());

    const cumulative = _battle2CumulativeTotals(sheet, athlete_id);
    return jsonResponse({ success: true, station: key, value: Number(value) || 0, heat_finished: true, cumulative: cumulative.totals, roundsCompleted: cumulative.roundsCompleted });
  } finally {
    lock.releaseLock();
  }
}

// Whistle blew exactly as a station was completed — no partial value needed, just close the heat.
function battle2Whistle(body) {
  const { pin, athlete_id } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '2') return jsonResponse({ error: 'Invalid PIN' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
    const open = _battle2FindOpenRow(sheet, athlete_id);
    if (!open) return jsonResponse({ error: 'No active heat found for this athlete' });
    sheet.getRange(open.rowIndex, open.headers.indexOf('heat_finished') + 1).setValue(true);
    sheet.getRange(open.rowIndex, open.headers.indexOf('updated_at') + 1).setValue(new Date().toISOString());
    return jsonResponse({ success: true, heat_finished: true });
  } finally {
    lock.releaseLock();
  }
}

// Public read: ranks by rounds completed -> stations reached in final round -> value at that station.
function battle2Scores(e) {
  const category = (e.parameter.category || '').toLowerCase();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ scores: [] });
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx        = headers.indexOf('athlete_id');
  const nameIdx       = headers.indexOf('name');
  const catIdx        = headers.indexOf('category');
  const completeIdx   = headers.indexOf('round_complete');
  const finishedIdx   = headers.indexOf('heat_finished');

  const byAthlete = {};
  data.slice(1).forEach(r => {
    if (!r[idIdx]) return;
    const id = String(r[idIdx]);
    if (!byAthlete[id]) byAthlete[id] = { athlete_id: id, name: r[nameIdx], category: r[catIdx], rounds_completed: 0, partial_stations: 0, partial_last_value: 0 };
    if (r[completeIdx] === true) byAthlete[id].rounds_completed++;
    if (r[finishedIdx] === true && r[completeIdx] !== true) {
      const filled = BATTLE2_STATIONS.filter(([k]) => r[headers.indexOf(k)] !== '');
      byAthlete[id].partial_stations   = filled.length;
      byAthlete[id].partial_last_value = filled.length ? Number(r[headers.indexOf(filled[filled.length - 1][0])]) || 0 : 0;
    }
  });

  const scores = Object.values(byAthlete)
    .filter(a => !category || String(a.category).toLowerCase() === category)
    .sort((a, b) => b.rounds_completed - a.rounds_completed || b.partial_stations - a.partial_stations || b.partial_last_value - a.partial_last_value)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  return jsonResponse({ scores, last_updated: new Date().toISOString() });
}

// ─── Battle 3 — post-round staff entry (pen-and-paper results typed in once) ─
//
// Not a live judge flow — staff key in the paper tally after the round, one
// row per athlete. Re-submitting the same athlete_id overwrites their row
// (lets staff correct a typo) rather than appending a duplicate.

function battle3Submit(body) {
  const { pin, athlete_id, snatch_weight, snatch_reps, sled_weight, sled_laps, ski_metres, box_step_reps, sandbag_reps } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '3') return jsonResponse({ error: 'Invalid PIN' });
  if (!athlete_id) return jsonResponse({ error: 'athlete_id required' });

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const athleteData  = athleteSheet.getDataRange().getValues();
  const athlete = athleteData.find((r, i) => i > 0 && String(r[0]) === String(athlete_id));
  if (!athlete) return jsonResponse({ error: 'Athlete not found' });
  const name = athlete[1];
  const category = String(athlete[3] || '').toLowerCase();

  const skiScoring     = _getScoringRow('3', 'ski');
  const boxScoring     = _getScoringRow('3', 'box_step_up');
  const sandbagScoring = _getScoringRow('3', 'sandbag_throw');

  const snatchPts  = (Number(snatch_weight) || 0) * (Number(snatch_reps) || 0);
  const sledPts    = (Number(sled_weight) || 0) * (Number(sled_laps) || 0);
  const skiPts     = (Number(ski_metres) || 0) * (skiScoring ? Number(skiScoring.pointsPerUnit) || 1 : 1);
  const boxPts     = (Number(box_step_reps) || 0) * (boxScoring ? Number(boxScoring.pointsPerUnit) || 10 : 10);
  const sandbagPts = (Number(sandbag_reps) || 0) * (sandbagScoring ? Number(sandbagScoring.pointsPerUnit) || 10 : 10);
  const total = snatchPts + sledPts + skiPts + boxPts + sandbagPts;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const sheet   = ss.getSheetByName(SCORE_SHEETS['3']);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data    = sheet.getDataRange().getValues();
    const existingIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(athlete_id));

    const row = new Array(headers.length).fill('');
    const set = (h, v) => { const idx = headers.indexOf(h); if (idx > -1) row[idx] = v; };
    set('athlete_id', athlete_id);
    set('name', name);
    set('category', category);
    set('snatch_weight', Number(snatch_weight) || 0);
    set('snatch_reps', Number(snatch_reps) || 0);
    set('sled_weight', Number(sled_weight) || 0);
    set('sled_laps', Number(sled_laps) || 0);
    set('ski_metres', Number(ski_metres) || 0);
    set('box_step_reps', Number(box_step_reps) || 0);
    set('sandbag_reps', Number(sandbag_reps) || 0);
    set('complete', true);
    set('total', total);
    set('submitted_at', new Date().toISOString());

    if (existingIdx > 0) {
      sheet.getRange(existingIdx + 1, 1, 1, headers.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return jsonResponse({ success: true, athlete_id, name, total, breakdown: { snatchPts, sledPts, skiPts, boxPts, sandbagPts } });
  } finally {
    lock.releaseLock();
  }
}

// ─── Gym Battle — rotation tracker ───────────────────────────────────────────
//
// Gym_Live: one row per zone, running point totals for the team currently in
// that zone. Front Squats judge triggers rotation; on the 5th rotation the
// heat is complete — totals archive to Gym_Results and the zone resets.

function _gymFindZoneRow(sheet, zone) {
  const data = sheet.getDataRange().getValues();
  const idx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(zone));
  return idx > -1 ? idx + 1 : null;
}

function gymStartTeam(body) {
  const { pin, team_name } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== 'gym') return jsonResponse({ error: 'Invalid PIN' });
  if (judge.station !== 'front_squats') return jsonResponse({ error: 'Only the Front Squats judge can start a new team/wave' });
  if (!team_name) return jsonResponse({ error: 'Team name required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(GYM_LIVE_SHEET);
    const rowIdx = _gymFindZoneRow(sheet, judge.assignment);
    if (!rowIdx) return jsonResponse({ error: 'Zone not found: ' + judge.assignment });
    sheet.getRange(rowIdx, 1, 1, 8).setValues([[judge.assignment, team_name, 0, 0, 0, 0, 0, 'active']]);
    return jsonResponse({ success: true, zone: judge.assignment, team_name });
  } finally {
    lock.releaseLock();
  }
}

// Gym Battle now uses single-entry via gym_submit_rotation (Front Squats
// enters all 4 stations at once) — this action is neutered rather than
// removed, so a stale device still running the old per-station gym.html
// can't silently double-count a score alongside the new entry flow.
function gymAddScore(body) {
  return jsonResponse({ error: 'Gym Battle now uses single-entry — reload your page' });
}

// Gym Battle now uses single-entry via gym_submit_rotation, which also
// advances the rotation counter — this action is neutered for the same
// reason as gymAddScore above (stale-device double-write protection).
function gymRotate(body) {
  return jsonResponse({ error: 'Gym Battle now uses single-entry — reload your page' });
}

// Front Squats judge submits all 4 stations' deltas for one rotation in a
// single atomic write, then advances the rotation counter — replaces 4
// separate gym_add_score calls + a separate gym_rotate call with one locked
// read-modify-write, so a dropped connection can never leave some stations
// updated and others not (same failure mode Battle 2 hit earlier today).
function gymSubmitRotation(body) {
  const { pin, deltas } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== 'gym') return jsonResponse({ error: 'Invalid PIN' });
  if (judge.station !== 'front_squats') return jsonResponse({ error: 'Only the Front Squats judge can submit a rotation' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(GYM_LIVE_SHEET);
    const rowIdx = _gymFindZoneRow(sheet, judge.assignment);
    if (!rowIdx) return jsonResponse({ error: 'Zone not found: ' + judge.assignment });

    const headers = sheet.getRange(1, 1, 1, 8).getValues()[0];
    const row = sheet.getRange(rowIdx, 1, 1, 8).getValues()[0];

    GYM_STATIONS.forEach(([key]) => {
      const col = headers.indexOf(key);
      if (col === -1) return;
      const delta = Number(deltas && deltas[key]) || 0;
      row[col] = (Number(row[col]) || 0) + delta;
    });

    const rotCol = headers.indexOf('rotations');
    const rotations = (Number(row[rotCol]) || 0) + 1;
    row[rotCol] = rotations;

    const toZoneState = (r) => { const z = {}; headers.forEach((h, i) => { z[h] = r[i]; }); return z; };

    if (rotations >= 5) {
      const [zoneId, team_name, fs, dp, rw, bj] = row;
      const teamScore = Number(fs) + Number(dp) + Number(rw) + Number(bj);
      const results = ss.getSheetByName(GYM_RESULTS_SHEET);
      results.appendRow([zoneId, team_name, fs, dp, rw, bj, teamScore, new Date().toISOString()]);
      const resetRow = [zoneId, '', 0, 0, 0, 0, 0, 'idle'];
      sheet.getRange(rowIdx, 1, 1, 8).setValues([resetRow]);
      return jsonResponse({ success: true, heat_complete: true, team_name, team_score: teamScore, zone: toZoneState(resetRow) });
    }

    sheet.getRange(rowIdx, 1, 1, 8).setValues([row]);
    return jsonResponse({ success: true, heat_complete: false, rotations, zone: toZoneState(row) });
  } finally {
    lock.releaseLock();
  }
}

// Lets any of the 4 station judges in a zone see current team name / totals / rotation count.
function gymZoneStatus(e) {
  const zone = e.parameter.zone;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(GYM_LIVE_SHEET);
  if (!sheet) return jsonResponse({ error: 'Gym_Live sheet not set up yet' });
  const rowIdx = _gymFindZoneRow(sheet, zone);
  if (!rowIdx) return jsonResponse({ error: 'Zone not found' });
  const headers = sheet.getRange(1, 1, 1, 8).getValues()[0];
  const row     = sheet.getRange(rowIdx, 1, 1, 8).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return jsonResponse({ zone: obj });
}

function gymScores(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(GYM_RESULTS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ scores: [] });
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const scoreIdx = headers.indexOf('team_score');
  const rows = data.slice(1).filter(r => r[0]);
  rows.sort((a, b) => Number(b[scoreIdx]) - Number(a[scoreIdx]));
  const scores = rows.map((r, i) => {
    const obj = { rank: i + 1 };
    headers.forEach((h, j) => { obj[h] = r[j]; });
    return obj;
  });
  return jsonResponse({ scores, last_updated: new Date().toISOString() });
}

// ─── Test data seeding (DEV/TESTING ONLY) ────────────────────────────────────
//
// Seeds 300 fake athletes (150 M / 150 F) into Athletes, scores them through
// Battle 1 with random values, and releases the leaderboard so Battle 2's
// roster (top 30 M/F) has something to test against. Every row this creates
// has an athlete_id starting with "TEST" so clearTestData() can remove it
// cleanly without touching real registrations or scores.
//
// Run seedTestData() once from the editor, test Battle 1/2/Gym Battle with
// the generated TEST athletes, then run clearTestData() before race day.

const TEST_ID_PREFIX = 'TEST';

function seedTestData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const scoreSheet   = ss.getSheetByName('Round1_Scores');
  const stations     = STATION_ROUNDS['1'];
  const count        = 300;

  const athleteHeaders = athleteSheet.getRange(1, 1, 1, athleteSheet.getLastColumn()).getValues()[0];
  const scoreHeaders   = scoreSheet.getRange(1, 1, 1, scoreSheet.getLastColumn()).getValues()[0];

  const athleteRows = [];
  const scoreRows   = [];

  for (let i = 1; i <= count; i++) {
    const category = i % 2 === 0 ? 'male' : 'female';
    const id   = TEST_ID_PREFIX + String(i).padStart(4, '0');
    const name = `Test Athlete ${i}`;
    const zone = ['A', 'B', 'C', 'D'][i % 4];
    const wave = String(1 + (i % 11));

    const aRow = new Array(athleteHeaders.length).fill('');
    const setA = (h, v) => { const idx = athleteHeaders.indexOf(h); if (idx > -1) aRow[idx] = v; };
    setA('athlete_id', id);
    setA('name', name);
    setA('category', category);
    setA('wave', wave);
    athleteRows.push(aRow);

    const sRow = new Array(scoreHeaders.length).fill('');
    const setS = (h, v) => { const idx = scoreHeaders.indexOf(h); if (idx > -1) sRow[idx] = v; };
    setS('athlete_id', id);
    setS('name', name);
    setS('category', category);
    setS('wave', wave);
    setS('zone', zone);
    let total = 0;
    stations.forEach(st => {
      const raw = Math.floor(Math.random() * 30) + 5;
      const scoring = _getScoringRow('1', st);
      const pts = scoring ? Number(scoring.pointsPerUnit) || 1 : 1;
      setS(st, raw);
      total += raw * pts;
    });
    setS('complete', true);
    setS('submitted_at', new Date().toISOString());
    setS('total', total);
    scoreRows.push(sRow);
  }

  athleteSheet.getRange(athleteSheet.getLastRow() + 1, 1, athleteRows.length, athleteHeaders.length).setValues(athleteRows);
  scoreSheet.getRange(scoreSheet.getLastRow() + 1, 1, scoreRows.length, scoreHeaders.length).setValues(scoreRows);

  // Force release so Leaderboard_Cache_R1 populates immediately (Battle 2 roster reads from it).
  const configSheet = ss.getSheetByName('Config');
  const cfgData = configSheet.getDataRange().getValues();
  const rowIdx = cfgData.findIndex(r => r[0] === 'release_all');
  if (rowIdx > -1) configSheet.getRange(rowIdx + 1, 2).setValue('TRUE');
  else configSheet.appendRow(['release_all', 'TRUE']);

  rebuildLeaderboard();
  Logger.log(`seedTestData complete: ${count} test athletes seeded, scored, and leaderboard released.`);
}

// Seeds 50 fake completed Gym Battle team results directly into Gym_Results
// (bypassing the live rotation flow) so the Gym Battle leaderboard has
// something to look at. Doesn't touch Gym_Live — test the live rotation UI
// separately with a real Gym Battle PIN if you want to exercise that flow.
function seedGymTestData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const results = ss.getSheetByName(GYM_RESULTS_SHEET);
  const count = 50;
  const rows = [];

  for (let i = 1; i <= count; i++) {
    const zone = String(1 + (i % 4));
    const teamName = `${TEST_ID_PREFIX} Gym ${i}`;
    const fs = (Math.floor(Math.random() * 30) + 10) * 10; // reps x 10 pts
    const dp = (Math.floor(Math.random() * 20) + 5) * 10;
    const rw = Math.floor(Math.random() * 300) + 100;      // metres x 1 pt
    const bj = (Math.floor(Math.random() * 25) + 5) * 10;
    const teamScore = fs + dp + rw + bj;
    rows.push([zone, teamName, fs, dp, rw, bj, teamScore, new Date().toISOString()]);
  }

  results.getRange(results.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  Logger.log(`seedGymTestData complete: ${count} test gym team results seeded.`);
}

// Removes every row (Athletes, Round1/2/3_Scores, Gym_Results) whose athlete_id
// or team_name starts with TEST. Safe to run repeatedly — only touches rows
// seedTestData() created, never real registrations or scores.
function clearTestData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  ['Athletes', 'Round1_Scores', 'Round2_Scores', 'Round3_Scores'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i > 0; i--) {
      if (String(data[i][0]).startsWith(TEST_ID_PREFIX)) sheet.deleteRow(i + 1);
    }
  });

  const gymResults = ss.getSheetByName(GYM_RESULTS_SHEET);
  if (gymResults && gymResults.getLastRow() > 1) {
    const data = gymResults.getDataRange().getValues();
    const teamIdx = data[0].indexOf('team_name');
    for (let i = data.length - 1; i > 0; i--) {
      if (String(data[i][teamIdx]).startsWith(TEST_ID_PREFIX)) gymResults.deleteRow(i + 1);
    }
  }

  rebuildLeaderboard();
  Logger.log('clearTestData complete — all TEST-prefixed rows removed.');
}

// ─── One-time setup (run from the Apps Script editor, not via HTTP) ─────────

function setupScoringTable() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SCORING_TABLE_SHEET);
  if (!sheet) sheet = ss.insertSheet(SCORING_TABLE_SHEET);
  sheet.clearContents();
  const headers = ['Battle', 'Station Key', 'Station Name', 'Target', 'Unit', 'Points/Unit', 'M Weight', 'F Weight', 'Notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const rows = [
    ['1', 's1_burpees',   'Static Burpees',           'Max', 'reps',   10, 'Bodyweight', 'Bodyweight', ''],
    ['1', 's2_bike',      'Erg Bike',                 'Max (2 min)', 'metres', 1, '—', '—', ''],
    ['1', 's3_lunges',    'Deadlift',                 'Max', 'reps',   10, '50kg', '30kg', ''],
    ['1', 's4_pushups',   'Hand Release Push Ups',    'Max', 'reps',   5,  'Bodyweight', 'Bodyweight', ''],
    ['1', 's5_sprint',    'Sprint with Weights',      'Max', 'laps',   20, '15kg x2', '10kg x2', ''],
    ['1', 's6_inchworms', 'Inch Worms',                'Max', 'reps',   10, 'Bodyweight', 'Bodyweight', ''],
    ['1', 's7_squats',    'DB Front Squats',          'Max', 'reps',   5,  '12.5kg x2', '5kg x2', ''],
    ['2', 'rowing',       'Rowing',                    500,   'metres', '', '—', '—', 'Fixed target per round'],
    ['2', 'devils_press', "Devil's Press",             12,    'reps',   '', '10kg x2', '5kg x2', ''],
    ['2', 'kb_walk',      'KB Walk',                   100,   'metres', '', '12kg x2', '8kg x2', ''],
    ['2', 'box_jump',     'Burpee Box Jump',           10,    'reps',   '', '24in', '20in', ''],
    ['gym', 'front_squats', 'Front Squats',            'Max', 'reps',   10, '15kg x2', '10kg x2', 'Accumulated'],
    ['gym', 'devils_press', "Devil's Press",           'Max', 'reps',   10, '15kg x2', '7.5kg x2', 'Accumulated'],
    ['gym', 'rower',        'Rower',                   'Max', 'metres', 1,  '—', '—', 'Accumulated'],
    ['gym', 'box_jump',     'Burpee Box Jump',         'Max', 'reps',   10, '24in', '20in', 'Accumulated'],
    ['gym', 'kb_hold',      'KB Hold',                 'Max time', 'seconds', '', '24kg', '16kg', 'Not scored — gates rotation only'],
    ['3', 'snatch',       'Single Arm Snatch',         40,    'reps',   '', 'athlete-selected', 'athlete-selected', 'Points = reps x weight used'],
    ['3', 'sled_push',    'Sled Push',                 4,     'laps',   '', 'athlete-selected', 'athlete-selected', 'Points = weight used x laps'],
    ['3', 'ski',          'Ski',                       'Max (4 min cap)', 'metres', 1, '—', '—', 'Points = metres x 1'],
    ['3', 'box_step_up',  'Box Step Up with Weights',  40,    'reps',   10, 'ref only', 'ref only', "Weight doesn't affect score"],
    ['3', 'sandbag_throw','Sandbag Back Throw',        'Max', 'reps',   10, '50kg (fixed)', '30kg (fixed)', 'Fixed gender weight'],
  ];
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  Logger.log('setupScoringTable complete: ' + rows.length + ' rows.');
}

function generateJudgePins() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(JUDGES_SHEET);
  if (!sheet) sheet = ss.insertSheet(JUDGES_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 5).setValues([['pin', 'battle', 'assignment', 'station', 'label']]).setFontWeight('bold');

  const randPin = () => Math.random().toString(36).substring(2, 8).toUpperCase();
  const rows = [];

  const ZONES = ['A', 'B', 'C', 'D'];
  const B1_STATIONS = [
    ['s1_burpees', 'Static Burpees'], ['s2_bike', 'Erg Bike'], ['s3_lunges', 'Deadlift'],
    ['s4_pushups', 'Hand Release Push Ups'], ['s5_sprint', 'Sprint with Weights'],
    ['s6_inchworms', 'Inch Worms'], ['s7_squats', 'DB Front Squats'],
  ];
  ZONES.forEach(zone => {
    B1_STATIONS.forEach(([key, name]) => {
      rows.push([randPin(), '1', zone, key, `Battle 1 — Zone ${zone} — ${name}`]);
    });
  });

  ['1', '2'].forEach(n => rows.push([randPin(), '2', 'M' + n, '', `Battle 2 — Male Lane ${n}`]));
  ['1', '2'].forEach(n => rows.push([randPin(), '2', 'F' + n, '', `Battle 2 — Female Lane ${n}`]));

  ['1', '2', '3', '4'].forEach(n => rows.push([randPin(), '3', 'staff' + n, '', `Battle 3 — Staff Entry ${n}`]));

  GYM_ZONES.forEach(zone => {
    GYM_STATIONS.forEach(([key, name]) => {
      rows.push([randPin(), 'gym', zone, key, `Gym Battle — Zone ${zone} — ${name}`]);
    });
  });

  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  Logger.log(`generateJudgePins complete: ${rows.length} PINs created.`);
  rows.forEach(r => Logger.log(`${r[4]}: PIN=${r[0]}`));
}

// Round3_Scores already exists with old placeholder headers (weight_total/time_seconds)
// from before Battle 3's stations were finalized. Only safe to overwrite if it's
// still just the header row — if real data has been entered, leave it alone.
function setupBattle3Sheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SCORE_SHEETS['3']);
  if (!sheet) sheet = ss.insertSheet(SCORE_SHEETS['3']);
  if (sheet.getLastRow() > 1) {
    Logger.log('Round3_Scores already has data rows — leaving it alone.');
    return;
  }
  sheet.clearContents();
  const headers = ['athlete_id', 'name', 'category', 'snatch_weight', 'snatch_reps', 'sled_weight', 'sled_laps', 'ski_metres', 'box_step_reps', 'sandbag_reps', 'complete', 'total', 'submitted_at'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  Logger.log('setupBattle3Sheet complete — Round3_Scores now uses the 5-station Battle 3 schema.');
}

// Adds Battle 3 staff-entry PINs to the EXISTING Judges sheet without
// touching any PINs already generated — safe to run after Battle 1/2/Gym
// PINs have already been distributed or tested (unlike generateJudgePins(),
// which wipes and regenerates everything).
function addBattle3Pins() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(JUDGES_SHEET);
  if (!sheet) { Logger.log('Judges sheet not found — run generateJudgePins() first.'); return; }
  const data = sheet.getDataRange().getValues();
  const alreadyHas = data.some((r, i) => i > 0 && String(r[1]) === '3');
  if (alreadyHas) { Logger.log('Battle 3 PINs already exist — not adding duplicates.'); return; }

  const randPin = () => Math.random().toString(36).substring(2, 8).toUpperCase();
  const rows = ['1', '2', '3', '4'].map(n => [randPin(), '3', 'staff' + n, '', `Battle 3 — Staff Entry ${n}`]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  Logger.log(`addBattle3Pins complete: ${rows.length} PINs added.`);
  rows.forEach(r => Logger.log(`${r[4]}: PIN=${r[0]}`));
}

function setupBattle2Sheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
  if (!sheet) sheet = ss.insertSheet(ROUND2_SCORES_SHEET);
  if (sheet.getLastRow() > 0) { Logger.log('Round2_Scores already has data — leaving it alone.'); return; }
  const headers = ['athlete_id', 'name', 'category', 'round', 'rowing', 'devils_press', 'kb_walk', 'box_jump', 'round_complete', 'heat_finished', 'updated_at'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  Logger.log('setupBattle2Sheet complete.');
}

// One-off migration: adds round_complete/heat_finished to a Round2_Scores
// sheet that was created before those columns existed in the schema.
// setupBattle2Sheet() only writes headers on a brand-new sheet, so a sheet
// that already had data from before this schema change never got them —
// appends only, never touches existing rows/columns, safe to re-run.
function migrateBattle2Schema() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ROUND2_SCORES_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  ['round_complete', 'heat_finished'].forEach(name => {
    if (headers.indexOf(name) === -1) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(name).setFontWeight('bold');
      headers.push(name);
      Logger.log(`Added missing column "${name}" at column ${col}.`);
    } else {
      Logger.log(`Column "${name}" already present — skipped.`);
    }
  });
}

function setupGymSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let live = ss.getSheetByName(GYM_LIVE_SHEET);
  if (!live) {
    live = ss.insertSheet(GYM_LIVE_SHEET);
    const headers = ['zone', 'team_name', 'front_squats', 'devils_press', 'rower', 'box_jump', 'rotations', 'status'];
    live.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    GYM_ZONES.forEach(zone => live.appendRow([zone, '', 0, 0, 0, 0, 0, 'idle']));
    Logger.log('Gym_Live created with 4 zone rows.');
  } else {
    Logger.log('Gym_Live already exists — leaving it alone.');
  }
  let results = ss.getSheetByName(GYM_RESULTS_SHEET);
  if (!results) {
    results = ss.insertSheet(GYM_RESULTS_SHEET);
    const headers = ['zone', 'team_name', 'front_squats', 'devils_press', 'rower', 'box_jump', 'team_score', 'finished_at'];
    results.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    Logger.log('Gym_Results created.');
  } else {
    Logger.log('Gym_Results already exists — leaving it alone.');
  }
}

// Run this once from the Apps Script editor before race day (and after any Athletes/Leaderboard_Cache_R1 reset).
function setupJudgeScoringSystem() {
  setupScoringTable();
  setupBattle2Sheet();
  setupBattle3Sheet();
  setupGymSheets();
  generateJudgePins();
  Logger.log('setupJudgeScoringSystem complete — check the Judges sheet for all PINs.');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
