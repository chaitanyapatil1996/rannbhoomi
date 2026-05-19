const SPREADSHEET_ID = '1KX7BtTBFBJkLW_Chl1Xi_WdWLjqUjUotZGrGQU3g9u8';

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'scores') return getScores(e);
  return jsonResponse({ error: 'Unknown action' }, 400);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  if (action === 'register') return handleRegistration(body);
  if (action === 'score') return handleScore(body);
  return jsonResponse({ error: 'Unknown action' }, 400);
}

function handleRegistration(body) {
  const { name, email, phone, category } = body;
  if (!name || !email || !category) {
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Registrations');
  const regId = 'RB' + Date.now().toString().slice(-6);
  const timestamp = new Date().toISOString();
  sheet.appendRow([regId, name, email, phone || '', category, '', timestamp, 'pending']);
  return jsonResponse({ success: true, reg_id: regId });
}

function getScores(e) {
  const round = e.parameter.round || '1';
  const category = (e.parameter.category || '').toLowerCase();
  const sheetNames = { '1': 'Round1_Scores', '2': 'Round2_Scores', '3': 'Round3_Scores' };
  const sheetName = sheetNames[round];
  if (!sheetName) return jsonResponse({ error: 'Invalid round' }, 400);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1)
    .filter(r => r[0] && (!category || r[2].toLowerCase() === category))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i]);
      return obj;
    })
    .sort((a, b) => b.total - a.total);

  rows.forEach((r, i) => r.rank = i + 1);
  return jsonResponse({ round, category, scores: rows });
}

function handleScore(body) {
  const { pin, round, athlete_id, scores } = body;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const config = ss.getSheetByName('Config').getDataRange().getValues();
  const judgePin = config.find(r => r[0] === 'judge_pin')?.[1];
  if (pin !== String(judgePin)) {
    return jsonResponse({ error: 'Invalid PIN' }, 403);
  }

  const sheetNames = { '1': 'Round1_Scores', '2': 'Round2_Scores', '3': 'Round3_Scores' };
  const sheet = ss.getSheetByName(sheetNames[round]);
  if (!sheet) return jsonResponse({ error: 'Invalid round' }, 400);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const totalIndex = headers.indexOf('total');
  const firstScoreIndex = headers.findIndex(h => !['athlete_id','name','category','wave','total','rank'].includes(h));
  const scoreColumns = headers.slice(firstScoreIndex, totalIndex);
  const total = scoreColumns.reduce((sum, col) => sum + (Number(scores[col]) || 0), 0);

  const data = sheet.getDataRange().getValues();
  const existingRowIndex = data.findIndex((r, i) => i > 0 && r[0] === athlete_id);
  if (existingRowIndex > 0) {
    scoreColumns.forEach((col, i) => {
      sheet.getRange(existingRowIndex + 1, firstScoreIndex + 1 + i).setValue(Number(scores[col]) || 0);
    });
    sheet.getRange(existingRowIndex + 1, totalIndex + 1).setValue(total);
  } else {
    const athleteSheet = ss.getSheetByName('Athletes');
    const athleteData = athleteSheet.getDataRange().getValues();
    const athlete = athleteData.find(r => r[0] === athlete_id);
    const name = athlete ? athlete[1] : 'Unknown';
    const category = athlete ? athlete[3] : '';
    const wave = athlete ? athlete[4] : '';
    const row = round === '1'
      ? [athlete_id, name, category, wave]
      : [athlete_id, name, category];
    scoreColumns.forEach(col => row.push(Number(scores[col]) || 0));
    row.push(total, '');
    sheet.appendRow(row);
  }
  return jsonResponse({ success: true, athlete_id, total });
}

function jsonResponse(data, status) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
