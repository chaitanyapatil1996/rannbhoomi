const SPREADSHEET_ID = '1KX7BtTBFBJkLW_Chl1Xi_WdWLjqUjUotZGrGQU3g9u8';

const STATION_ROUNDS = {
  '1': ['s1_burpees','s2_bike','s3_lunges','s4_pushups','s5_sprint','s6_inchworms','s7_squats'],
  '2': ['rowing','devils_press','kb_walk','box_jump'],
  '3': ['weight_total','time_seconds'],
};

const SCORE_SHEETS  = { '1':'Round1_Scores',       '2':'Round2_Scores',       '3':'Round3_Scores'       };
const CACHE_SHEETS  = { '1':'Leaderboard_Cache_R1', '2':'Leaderboard_Cache_R2', '3':'Leaderboard_Cache_R3' };

// ─── Routing ────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'scores')           return getScores(e);
  if (action === 'validate_athlete') return validateAthlete(e);
  if (action === 'athlete')          return getAthlete(e);
  if (action === 'analytics')        return getAnalytics(e);
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
  return jsonResponse({ error: 'Unknown action' });
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
  const { pin, round, zone, station, athlete_id, value } = body;
  if (!pin || !round || !station || !athlete_id) return jsonResponse({ error: 'Missing required fields' });

  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);

  if (String(pin) !== String(cfg['judge_pin']))       return jsonResponse({ error: 'Invalid PIN' });
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
      const total       = vals.reduce((sum, v) => sum + (Number(v) || 0), 0);
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

    validRows.sort((a, b) => (Number(b[totalIdx]) || 0) - (Number(a[totalIdx]) || 0));

    const cacheName = CACHE_SHEETS[round];
    let cacheSheet  = ss.getSheetByName(cacheName);
    if (!cacheSheet) {
      cacheSheet = ss.insertSheet(cacheName);
    } else {
      cacheSheet.clearContents();
    }

    cacheSheet.appendRow(['rank', ...headers]);
    validRows.forEach((row, i) => cacheSheet.appendRow([i + 1, ...row]));
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

// ─── Utility ──────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
