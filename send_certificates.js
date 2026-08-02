// send_certificates.js
// Emails every Solo athlete and Gym Battle team their real Rannbhoomi
// certificate (rendered from the live site, not a duplicate template) plus
// a short personalized note. Run once, after the event, when all Battles
// are scored and released.
//
// Usage:
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js --dry-run
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js --test-to=you@example.com
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js
//
// Setup:
//   1. Add an `email` column (last column) to the Gym_Results sheet — one
//      email per team row. Teams without one are skipped, not an error.
//   2. Solo athlete emails come from the Athletes sheet's `email` column —
//      confirm it's populated (schema is athlete_id, name, email, category, wave).
//   3. Generate a Gmail App Password for frontline@rannbhoomi.com
//      (Google Account → Security → App Passwords) and set it as
//      GMAIL_APP_PASSWORD before running for real.

const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const { buildSoloEmail, buildGymEmail } = require('./send_certificates_lib');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxELQsXchGNJXNDyETPXuFOLNKXNNL48OZcG0IRtS-eohXx9gOSP-ZFC1J0PHl-QjNG/exec';
const SITE_URL        = 'https://rannbhoomi.com/scores/';
const FROM_EMAIL       = 'frontline@rannbhoomi.com';
const GMAIL_PASS       = process.env.GMAIL_APP_PASSWORD;
const OUTPUT_DIR       = path.join(__dirname, 'certificates');
const DRY_RUN          = process.argv.includes('--dry-run');
const TEST_TO          = (process.argv.find(a => a.startsWith('--test-to=')) || '').split('=')[1];
const SEND_DELAY_MS    = 600;

function safeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9 ]/g, '').trim();
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

// ─── Certificate rendering (reuses the live page's own render functions,
// so the PDF can never drift from what athletes see on the site) ────────────

async function renderSoloCertificatePDF(browser, athleteRecord, outPath) {
  const page = await browser.newPage();
  try {
    await page.goto(SITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((data) => {
      renderCertificate(data);
      document.getElementById('certOverlay').classList.add('open');
    }, athleteRecord);
    await page.waitForFunction(() => {
      const img = document.querySelector('.cert-shield');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 10000 });
    await page.emulateMediaType('print');
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  } finally {
    await page.close();
  }
}

async function renderGymCertificatePDF(browser, team, outPath) {
  const page = await browser.newPage();
  try {
    await page.goto(SITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((teamData) => {
      renderGymCertificate(teamData);
      document.getElementById('certOverlay').classList.add('open');
    }, team);
    await page.waitForFunction(() => {
      const img = document.querySelector('.cert-shield');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 10000 });
    await page.emulateMediaType('print');
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  } finally {
    await page.close();
  }
}

// ─── Email ───────────────────────────────────────────────────────────────────

function makeTransporter() {
  if (DRY_RUN) return null;
  if (!GMAIL_PASS) {
    console.error('Set GMAIL_APP_PASSWORD environment variable, or use --dry-run to skip email.');
    process.exit(1);
  }
  return nodemailer.createTransport({ service: 'gmail', auth: { user: FROM_EMAIL, pass: GMAIL_PASS } });
}

async function sendCertificateEmail(transporter, { to, subject, text, pdfPath, fileName }) {
  await transporter.sendMail({
    from: `"Rannbhoomi" <${FROM_EMAIL}>`,
    to,
    subject,
    text,
    attachments: [{ filename: fileName, path: pdfPath }],
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Fetching Battle 1 leaderboard...');
  const board1Data = await fetchJSON(`${APPS_SCRIPT_URL}?action=scores&round=1`);
  const board1 = board1Data.scores || [];
  console.log(`Found ${board1.length} Solo athletes in Battle 1.`);

  console.log('Fetching Gym Battle results...');
  const gymData  = await fetchJSON(`${APPS_SCRIPT_URL}?action=gym_scores`);
  const gymTeams = gymData.scores || [];
  console.log(`Found ${gymTeams.length} Gym Battle teams.`);

  const browser      = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const transporter  = makeTransporter();

  const logLines = [`Certificate Send Log — ${new Date().toLocaleString()}`, '─'.repeat(80)];
  let sent = 0, skipped = 0;

  try {
    // ── Solo athletes ──
    for (const row of board1) {
      const boardForCategory = board1.filter(r => r.category === row.category);
      process.stdout.write(`${row.name} (${row.category}, rank ${row.gender_rank}) ... `);

      try {
        const record = await fetchJSON(`${APPS_SCRIPT_URL}?action=athlete&athlete_id=${encodeURIComponent(row.athlete_id)}`);
        if (record.error || !record.athlete) {
          console.log('SKIP — could not load athlete record');
          logLines.push(`SKIPPED  | ${row.name.padEnd(30)} | Solo | no athlete record`);
          skipped++;
          continue;
        }

        const fileName = `${safeFileName(row.name)} - Certificate.pdf`;
        const pdfPath  = path.join(OUTPUT_DIR, fileName);
        await renderSoloCertificatePDF(browser, record, pdfPath);

        const { subject, text } = buildSoloEmail(row, record, boardForCategory);

        if (DRY_RUN) {
          console.log('PDF saved (dry run)');
          logLines.push(`DRY RUN  | ${row.name.padEnd(30)} | Solo | ${fileName}`);
          continue;
        }

        const sendTo = TEST_TO || record.athlete.email;
        if (!sendTo) {
          console.log('PDF saved — no email on record');
          logLines.push(`NO EMAIL | ${row.name.padEnd(30)} | Solo | ${fileName}`);
          skipped++;
          continue;
        }

        await sendCertificateEmail(transporter, { to: sendTo, subject, text, pdfPath, fileName });
        console.log(`sent to ${sendTo}`);
        logLines.push(`SENT     | ${row.name.padEnd(30)} | Solo | ${fileName} | -> ${sendTo}`);
        sent++;
        if (TEST_TO) break;
        await new Promise(r => setTimeout(r, SEND_DELAY_MS));
      } catch (err) {
        console.log(`FAILED — ${err.message}`);
        logLines.push(`FAILED   | ${row.name.padEnd(30)} | Solo | ${err.message}`);
        skipped++;
        continue;
      }
    }

    // ── Gym Battle teams (skipped entirely if --test-to already sent one above) ──
    if (!(TEST_TO && sent > 0)) {
      for (const team of gymTeams) {
        process.stdout.write(`${team.team_name} (Gym, rank ${team.rank}) ... `);

        try {
          const fileName = `${safeFileName(team.team_name)} - Certificate.pdf`;
          const pdfPath  = path.join(OUTPUT_DIR, fileName);
          await renderGymCertificatePDF(browser, team, pdfPath);

          const { subject, text } = buildGymEmail(team);

          if (DRY_RUN) {
            console.log('PDF saved (dry run)');
            logLines.push(`DRY RUN  | ${team.team_name.padEnd(30)} | Gym  | ${fileName}`);
            continue;
          }

          const sendTo = TEST_TO || team.email;
          if (!sendTo) {
            console.log('PDF saved — no email on record');
            logLines.push(`NO EMAIL | ${team.team_name.padEnd(30)} | Gym  | ${fileName}`);
            skipped++;
            continue;
          }

          await sendCertificateEmail(transporter, { to: sendTo, subject, text, pdfPath, fileName });
          console.log(`sent to ${sendTo}`);
          logLines.push(`SENT     | ${team.team_name.padEnd(30)} | Gym  | ${fileName} | -> ${sendTo}`);
          sent++;
          if (TEST_TO) break;
          await new Promise(r => setTimeout(r, SEND_DELAY_MS));
        } catch (err) {
          console.log(`FAILED — ${err.message}`);
          logLines.push(`FAILED   | ${team.team_name.padEnd(30)} | Gym  | ${err.message}`);
          skipped++;
          continue;
        }
      }
    }

    console.log(`\nDone. ${sent} sent, ${skipped} skipped.`);
    console.log(`PDFs saved to: ${OUTPUT_DIR}`);
  } finally {
    logLines.push('─'.repeat(80));
    logLines.push(`Total: ${sent} sent, ${skipped} skipped`);
    const logPath = path.join(__dirname, `certificate_log_${Date.now()}.txt`);
    fs.writeFileSync(logPath, logLines.join('\n'));
    console.log(`Log saved to:  ${logPath}`);

    if (browser) await browser.close().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });
