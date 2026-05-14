# Rannbhoomi Website V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic 937KB single-file website into a maintainable multi-file project, fix identified design and UX issues, and add a registration form + scoring system backed by Google Sheets — all at zero hosting cost.

**Architecture:** Plain HTML/CSS/JS frontend hosted on GitHub Pages (free). A single Google Apps Script web app acts as the backend API, reading/writing to Google Sheets. No Node, no database, no paid services.

**Tech Stack:** HTML5 · CSS3 (custom properties, grid, flexbox) · Vanilla JS · Google Apps Script · Google Sheets · GitHub Pages

---

## Design Critique of Existing Website

Before touching code, understand what's broken:

1. **937KB file size** — all images are base64-embedded in CSS. The `Images/` folder already has the source PNGs. Must be referenced as external files.
2. **Duplicate hero text** — "The Arena Within" appears twice: once as `.hero-eyebrow` above the wordmark, again as `.hero-subtitle` below it.
3. **Contact section has no links** — `.c-icon` spans just say "Instagram", "Email", "Location" as plain text. No `<a>` tags, no actual links.
4. **Body copy is unreadable** — all body text uses Cinzel serif at 13px with `letter-spacing: 2px` and `line-height: 2.1`. Cinzel is a display/title font, not for paragraphs. FAQ answers, about text — all suffer.
5. **Registration is a dead end** — "Register Now" scrolls to contact. There is no form.
6. **Mobile nav doesn't close** on link click — tapping a nav link leaves the menu open.
7. **Stations vs Format redundancy** — both sections show the same workout data in slightly different layouts.
8. **No favicon** — `<head>` has no `<link rel="icon">`.
9. **Registration "featured" card** — Male vs Female have no meaningful difference to justify a "featured" card design.

---

## File Structure

```
rannbhoomi/
├── index.html                  ← cleaned main site (was 937KB, becomes ~25KB)
├── css/
│   └── style.css               ← all styles extracted from <style> block
├── js/
│   └── main.js                 ← all scripts extracted from <script> block
├── images/
│   ├── parchment.png           ← renamed from "RB Design Elements-01.png"
│   ├── scar-crimson.png        ← renamed from "RB Design Elements-02.png"
│   ├── scar-gold.png           ← renamed from "RB Design Elements-03.png"
│   ├── logo-scar.png           ← renamed from "RB Design Elements-04.png"
│   ├── pillars-gold.png        ← renamed from "RB Design Elements-05.png"
│   ├── pillars-crimson.png     ← renamed from "RB Design Elements-06.png"
│   ├── logo-crimson.png        ← renamed from "RB Design Elements-07.png"
│   └── logo-gold.png           ← renamed from "RB Design Elements-08.png"
├── register/
│   └── index.html              ← registration form page
├── scores/
│   └── index.html              ← public leaderboard page
├── judge/
│   └── index.html              ← judge score entry portal (PIN-protected)
├── backend/
│   └── Code.gs                 ← Google Apps Script source (deploy separately)
└── docs/superpowers/plans/     ← this file
```

**Google Sheets structure** (one spreadsheet, multiple sheets):
- `Registrations`: reg_id · name · email · phone · category · wave · timestamp · status
- `Athletes`: athlete_id · name · category · wave · email (master list post-close)
- `Round1_Scores`: athlete_id · name · category · wave · s1 · s2 · s3 · s4 · s5 · s6 · s7 · total · rank
- `Round2_Scores`: athlete_id · name · category · row_cal · devils_press · kb_walk · box_jump · total · rank
- `Round3_Scores`: athlete_id · name · category · weight_total · time_seconds · total · rank
- `Config`: key · value (stores judge PIN, registration_open flag, etc.)

---

## Task 1: Copy and rename image assets

**Files:**
- Create: `images/parchment.png`, `images/scar-crimson.png`, etc.

- [ ] **Step 1: Copy and rename the 8 design element PNGs**

```bash
cp "Images/RB Design Elements-01.png" images/parchment.png
cp "Images/RB Design Elements-02.png" images/scar-crimson.png
cp "Images/RB Design Elements-03.png" images/scar-gold.png
cp "Images/RB Design Elements-04.png" images/logo-scar.png
cp "Images/RB Design Elements-05.png" images/pillars-gold.png
cp "Images/RB Design Elements-06.png" images/pillars-crimson.png
cp "Images/RB Design Elements-07.png" images/logo-crimson.png
cp "Images/RB Design Elements-08.png" images/logo-gold.png
```

Run: `ls images/`
Expected: 8 PNG files listed.

- [ ] **Step 2: Commit**

```bash
git add images/
git commit -m "feat: add renamed design element images"
```

---

## Task 2: Extract CSS into css/style.css

**Files:**
- Create: `css/style.css`
- Modify: `index.html` (remove `<style>` block, add `<link>` tag)

The current HTML has a massive `<style>` block that embeds base64 images inline. The goal is to extract it to an external file and replace every `url('data:image/...base64,...')` with a path to the correct file in `images/`.

**There are 3 base64 image URLs in the CSS to replace:**

| Where used | CSS selector | Replace with |
|---|---|---|
| Body parchment background | `body::before { background-image: url('data:image/png;base64,...') }` | `url('../images/parchment.png')` |
| Round panel texture | `.round-panel::before { background-image: url('data:image/png;base64,...') }` | `url('../images/parchment.png')` |
| Wordmark scar | `.wordmark-scar { background-image: url('data:image/png;base64,...') }` | `url('../images/scar-crimson.png')` |

- [ ] **Step 1: Create `css/style.css`**

Copy everything between `<style>` and `</style>` in `index.html` into `css/style.css`. Then find and replace the three base64 URLs using the table above. The base64 strings are very long — use a text editor's find-and-replace on `url('data:image/png;base64,` to locate them.

Expected result: `css/style.css` is ~15–20KB (down from the bloated embedded version).

- [ ] **Step 2: Update `index.html` — remove `<style>`, add `<link>`**

In `index.html`, remove the entire `<style>...</style>` block and replace it with:

```html
<link rel="stylesheet" href="css/style.css">
```

Also add a favicon reference in `<head>`:

```html
<link rel="icon" type="image/png" href="images/logo-crimson.png">
```

- [ ] **Step 3: Verify the about section logo still renders**

The about icon `<img>` in `index.html` currently has a `src="data:image/..."` base64. Replace it:

```html
<!-- Find this: -->
<div class="about-icon reveal">
  <img src="data:image/..." alt="RB Logo">
</div>

<!-- Replace with: -->
<div class="about-icon reveal">
  <img src="images/logo-crimson.png" alt="RB Logo">
</div>
```

- [ ] **Step 4: Open `index.html` in browser and verify visual parity**

The page should look identical to before. Check: parchment background loads, scar in hero wordmark shows, about logo shows, round panels have texture.

- [ ] **Step 5: Commit**

```bash
git add css/style.css index.html
git commit -m "refactor: extract CSS to external file, replace base64 with image paths"
```

---

## Task 3: Extract JS and fix nav/UX bugs

**Files:**
- Create: `js/main.js`
- Modify: `index.html`

- [ ] **Step 1: Create `js/main.js` with the extracted + fixed script**

```javascript
function switchTab(i) {
  document.querySelectorAll('.tab-btn').forEach((b, j) => b.classList.toggle('active', i === j));
  document.querySelectorAll('.tab-panel').forEach((p, j) => p.classList.toggle('active', i === j));
}

function toggleFaq(btn) {
  btn.parentElement.classList.toggle('open');
}

function toggleNav(el) {
  const ul = document.querySelector('.nav-links');
  const open = ul.style.display === 'flex';
  ul.style.cssText = open ? '' :
    'display:flex;flex-direction:column;position:fixed;top:62px;left:0;right:0;background:rgba(214,185,122,0.98);padding:20px 5vw;gap:14px;border-bottom:1px solid rgba(76,0,7,.25);z-index:998;';
}

// Close mobile nav when any nav link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    const ul = document.querySelector('.nav-links');
    ul.style.cssText = '';
  });
});

// Scroll-reveal animation
const obs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) e.target.classList.add('visible');
}), { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
```

- [ ] **Step 2: Update `index.html` — remove `<script>`, add external reference**

Remove the `<script>...</script>` block near the bottom. Add before `</body>`:

```html
<script src="js/main.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add js/main.js index.html
git commit -m "refactor: extract JS, fix mobile nav closing on link click"
```

---

## Task 4: Fix visual/UX issues in index.html

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

Fix 5 specific issues identified in the critique.

- [ ] **Step 1: Remove duplicate "The Arena Within" from hero**

Find in `index.html`:

```html
<p class="hero-eyebrow">The Arena Within</p>
```

Delete that line. The subtitle version below the wordmark remains.

- [ ] **Step 2: Fix contact section — add real links**

Find the contact grid and replace the three `.c-box` blocks:

```html
<!-- Before -->
<div class="c-box">
  <span class="c-icon">Instagram</span>
  <span class="c-title">Follow</span>
  <div class="c-val">@rannbhoomi<br>Updates &amp; announcements</div>
</div>
<div class="c-box">
  <span class="c-icon">Email</span>
  <span class="c-title">Write</span>
  <div class="c-val">hello@rannbhoomi.com<br>Enquiries &amp; registration</div>
</div>
<div class="c-box">
  <span class="c-icon">Location</span>
  <span class="c-title">Find Us</span>
  <div class="c-val">Pune, Maharashtra<br>India</div>
</div>

<!-- After -->
<a class="c-box" href="https://instagram.com/rannbhoomi" target="_blank" rel="noopener">
  <span class="c-icon">&#9670;</span>
  <span class="c-title">Instagram</span>
  <div class="c-val">@rannbhoomi<br>Updates &amp; announcements</div>
</a>
<a class="c-box" href="mailto:hello@rannbhoomi.com">
  <span class="c-icon">&#9670;</span>
  <span class="c-title">Email</span>
  <div class="c-val">hello@rannbhoomi.com<br>Enquiries &amp; registration</div>
</a>
<div class="c-box">
  <span class="c-icon">&#9670;</span>
  <span class="c-title">Location</span>
  <div class="c-val">Pune, Maharashtra<br>India</div>
</div>
```

- [ ] **Step 3: Fix `.c-box` CSS to support anchor tags**

In `css/style.css`, find the `.c-box` rule and add:

```css
a.c-box {
  text-decoration: none;
  cursor: pointer;
}
a.c-box:hover {
  border-color: var(--crimson);
  background: rgba(76,0,7,0.08);
}
```

- [ ] **Step 4: Improve body copy readability**

In `css/style.css`, update `.about-body` and `.faq-a`:

```css
/* Before */
.about-body {
  font-family: 'Cinzel', serif;
  font-size: 13px;
  color: var(--text);
  opacity: 0.7;
  line-height: 2.1;
  margin-bottom: 14px;
  letter-spacing: .4px;
}

/* After — switch body copy to Georgia for readability */
.about-body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 15px;
  color: var(--text);
  opacity: 0.75;
  line-height: 1.85;
  margin-bottom: 14px;
  letter-spacing: 0;
}
```

Do the same for `.faq-a`:

```css
/* Before */
.faq-a {
  font-family: 'Cinzel', serif;
  font-size: 13px;
  /* ... */
}

/* After */
.faq-a {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text);
  opacity: 0.72;
  line-height: 1.8;
  padding: 18px 24px 24px;
  letter-spacing: 0;
}
```

- [ ] **Step 5: Fix registration section — remove "featured" distinction, update CTA**

Find the registration section. Replace the two `.reg-card` blocks:

```html
<!-- Before: Male card and a "featured" Female card -->
<div class="reg-cards">
  <div class="reg-card">...</div>
  <div class="reg-card featured">...</div>
</div>
<a href="#contact" class="reg-btn">Register Now</a>
<p ...>Contact us to complete registration</p>

<!-- After: Equal cards, CTA links to register page -->
<div class="reg-cards">
  <div class="reg-card">
    <span class="reg-type">Category</span>
    <span class="reg-title">Male</span>
    <span class="reg-price"><span class="reg-cur">₹</span>TBA</span>
    <span class="reg-note">Early bird pricing available</span>
  </div>
  <div class="reg-card">
    <span class="reg-type">Category</span>
    <span class="reg-title">Female</span>
    <span class="reg-price"><span class="reg-cur">₹</span>TBA</span>
    <span class="reg-note">Early bird pricing available</span>
  </div>
</div>
<a href="register/" class="reg-btn">Register Now</a>
<p style="font-family:'Cinzel',serif;font-size:10px;color:var(--text);opacity:0.4;margin-top:20px;letter-spacing:3px;">Registration opens soon — enter your details to secure your spot</p>
```

- [ ] **Step 6: Open in browser, verify all 5 fixes visually**

Check:
- Hero: "The Arena Within" only appears once (below the wordmark)
- Contact: Instagram and Email are clickable links
- About body text is visibly more readable
- FAQ answers are visibly more readable
- Registration cards are equal, "Register Now" goes to `register/`

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css
git commit -m "fix: remove duplicate hero text, fix contact links, improve body readability, fix reg section"
```

---

## Task 5: Add event countdown timer

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `css/style.css`

A countdown in the hero adds urgency and is a standard pattern for event sites.

- [ ] **Step 1: Add countdown HTML to hero section**

In `index.html`, inside `<section id="hero">`, add after `.hero-pills` div and before `.hero-cta`:

```html
<div class="hero-countdown" id="countdown">
  <div class="cd-unit"><span class="cd-num" id="cd-days">--</span><span class="cd-lbl">Days</span></div>
  <div class="cd-sep">:</div>
  <div class="cd-unit"><span class="cd-num" id="cd-hours">--</span><span class="cd-lbl">Hours</span></div>
  <div class="cd-sep">:</div>
  <div class="cd-unit"><span class="cd-num" id="cd-mins">--</span><span class="cd-lbl">Mins</span></div>
</div>
```

- [ ] **Step 2: Add countdown CSS to `css/style.css`**

```css
.hero-countdown {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 28px 0 0;
  justify-content: center;
}
.cd-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}
.cd-num {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 48px;
  color: var(--gold);
  line-height: 1;
  letter-spacing: 2px;
}
.cd-lbl {
  font-family: 'Cinzel', serif;
  font-size: 9px;
  letter-spacing: 3px;
  color: var(--gold);
  opacity: 0.6;
  margin-top: 4px;
}
.cd-sep {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 40px;
  color: var(--gold);
  opacity: 0.4;
  margin-bottom: 14px;
}
```

- [ ] **Step 3: Add countdown JS to `js/main.js`**

```javascript
// Set to actual event date when announced. Placeholder: Jan 1, 2027.
const EVENT_DATE = new Date('2027-01-01T08:00:00+05:30');

function updateCountdown() {
  const now = new Date();
  const diff = EVENT_DATE - now;
  if (diff <= 0) {
    document.getElementById('countdown').innerHTML = '<p class="cd-live">Event is Live!</p>';
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
}
updateCountdown();
setInterval(updateCountdown, 60000);
```

- [ ] **Step 4: Verify countdown shows in hero on desktop and mobile**

The numbers should appear in gold Bebas Neue font between the pills row and the "Enter the Arena" CTA.

- [ ] **Step 5: Commit**

```bash
git add index.html js/main.js css/style.css
git commit -m "feat: add event countdown timer to hero"
```

---

## Task 6: Set up Google Sheets database

This is a manual setup step — no code to write, but must be done before Tasks 7–9.

- [ ] **Step 1: Create a new Google Spreadsheet**

Go to sheets.google.com → New spreadsheet → Name it "Rannbhoomi 2026 — Data".

- [ ] **Step 2: Create these 6 sheets (tabs)**

Rename Sheet1 to `Registrations`. Create 5 more tabs:

| Sheet name | Column headers (Row 1) |
|---|---|
| `Registrations` | reg_id · name · email · phone · category · wave · timestamp · status |
| `Athletes` | athlete_id · name · email · category · wave |
| `Config` | key · value |
| `Round1_Scores` | athlete_id · name · category · wave · s1_burpees · s2_bike · s3_lunges · s4_pushups · s5_sprint · s6_inchworms · s7_squats · total · rank |
| `Round2_Scores` | athlete_id · name · category · rowing · devils_press · kb_walk · box_jump · total · rank |
| `Round3_Scores` | athlete_id · name · category · weight_total · time_seconds · total · rank |

- [ ] **Step 3: Add Config values**

In the `Config` sheet, add these rows:

| key | value |
|---|---|
| judge_pin | `CHANGE_THIS_PIN` |
| registration_open | `true` |

- [ ] **Step 4: Note the Spreadsheet ID**

The spreadsheet URL is `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`. Copy the ID — needed in the Apps Script.

---

## Task 7: Write Google Apps Script backend

**Files:**
- Create: `backend/Code.gs`

This is the entire backend. Deploy it once as a Google Apps Script web app. It handles registration writes, score reads, and judge score writes.

- [ ] **Step 1: Create `backend/Code.gs`**

```javascript
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';

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
  const scoreColumns = headers.slice(3, headers.indexOf('total'));
  const total = scoreColumns.reduce((sum, col) => sum + (Number(scores[col]) || 0), 0);

  // Find existing row for athlete or append new
  const data = sheet.getDataRange().getValues();
  const existingRow = data.findIndex((r, i) => i > 0 && r[0] === athlete_id);
  if (existingRow > 0) {
    scoreColumns.forEach((col, i) => {
      sheet.getRange(existingRow + 1, 4 + i).setValue(Number(scores[col]) || 0);
    });
    sheet.getRange(existingRow + 1, headers.indexOf('total') + 1).setValue(total);
  } else {
    const athleteSheet = ss.getSheetByName('Athletes');
    const athleteData = athleteSheet.getDataRange().getValues();
    const athlete = athleteData.find(r => r[0] === athlete_id);
    const name = athlete ? athlete[1] : 'Unknown';
    const category = athlete ? athlete[3] : '';
    const wave = athlete ? athlete[4] : '';
    const row = [athlete_id, name, category, wave];
    scoreColumns.forEach(col => row.push(Number(scores[col]) || 0));
    row.push(total, '');
    sheet.appendRow(row);
  }
  return jsonResponse({ success: true, athlete_id, total });
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
```

- [ ] **Step 2: Deploy the Apps Script**

1. Go to script.google.com → New project → Paste the code from `Code.gs`
2. Replace `PASTE_YOUR_SPREADSHEET_ID_HERE` with your actual spreadsheet ID
3. Click Deploy → New deployment → Type: Web App
4. Execute as: **Me** · Who has access: **Anyone**
5. Click Deploy → Copy the web app URL
6. Save that URL — it becomes `APPS_SCRIPT_URL` used in Tasks 8 and 9

- [ ] **Step 3: Test the registration endpoint**

```bash
curl -X POST "YOUR_APPS_SCRIPT_URL" \
  -H "Content-Type: application/json" \
  -d '{"action":"register","name":"Test Athlete","email":"test@test.com","category":"Male"}'
```

Expected response: `{"success":true,"reg_id":"RB123456"}`
Verify: open the Spreadsheet → Registrations sheet → row appeared.

- [ ] **Step 4: Commit `backend/Code.gs`**

```bash
git add backend/Code.gs
git commit -m "feat: add Google Apps Script backend for registration and scores"
```

---

## Task 8: Build registration page

**Files:**
- Create: `register/index.html`

This page matches the main site's visual language — parchment, crimson, Cinzel/Bebas — with a registration form that POSTs to the Apps Script.

- [ ] **Step 1: Create `register/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Register — RANNBHOOMI 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../images/logo-crimson.png">
<style>
:root {
  --crimson: #4c0007;
  --gold: #dec189;
  --text: #4c0007;
  --crimson-border: rgba(76,0,7,0.28);
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  min-height: 100vh;
  background: #d6b97a url('../images/parchment.png') center/cover fixed;
  font-family: 'Cinzel', serif;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}
.back-link {
  align-self: flex-start;
  font-size: 11px;
  letter-spacing: 3px;
  color: var(--crimson);
  opacity: 0.6;
  text-decoration: none;
  margin-bottom: 40px;
}
.back-link:hover { opacity: 1; }
.form-wrap {
  width: 100%;
  max-width: 560px;
  border: 1px solid var(--crimson-border);
  padding: 52px 48px;
  background: rgba(214,185,122,0.6);
}
.form-label { font-size: 10px; letter-spacing: 6px; opacity: 0.4; margin-bottom: 14px; display: block; }
.form-title { font-family: 'Bebas Neue', sans-serif; font-size: 56px; letter-spacing: 4px; color: var(--crimson); line-height:1; }
.form-rule { width: 60px; height: 2px; background: var(--crimson); opacity: 0.35; margin: 18px 0 36px; }
label { display: block; font-size: 10px; letter-spacing: 3px; opacity: 0.5; margin-bottom: 8px; margin-top: 22px; }
input, select {
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--crimson-border);
  background: rgba(214,185,122,0.4);
  font-family: 'Cinzel', serif;
  font-size: 13px;
  color: var(--crimson);
  outline: none;
  appearance: none;
}
input:focus, select:focus { border-color: var(--crimson); background: rgba(214,185,122,0.7); }
select option { background: #d6b97a; }
.submit-btn {
  display: block;
  width: 100%;
  margin-top: 36px;
  padding: 18px;
  background: var(--crimson);
  color: var(--gold);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  letter-spacing: 4px;
  border: none;
  cursor: pointer;
  transition: opacity .2s;
}
.submit-btn:hover { opacity: 0.85; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.msg { margin-top: 24px; font-size: 12px; letter-spacing: 2px; min-height: 20px; text-align: center; }
.msg.success { color: #1a6b00; }
.msg.error { color: var(--crimson); }
.reg-id-box {
  display: none;
  margin-top: 28px;
  padding: 20px;
  border: 1px solid var(--crimson-border);
  text-align: center;
}
.reg-id-label { font-size: 10px; letter-spacing: 4px; opacity: 0.5; margin-bottom: 10px; display: block; }
.reg-id-val { font-family: 'Bebas Neue', sans-serif; font-size: 36px; color: var(--crimson); letter-spacing: 4px; }
</style>
</head>
<body>
<a class="back-link" href="../">← BACK TO RANNBHOOMI</a>
<div class="form-wrap">
  <span class="form-label">Join The Arena</span>
  <h1 class="form-title">REGISTER</h1>
  <div class="form-rule"></div>

  <form id="regForm">
    <label for="name">FULL NAME</label>
    <input type="text" id="name" name="name" placeholder="As it appears on ID" required>

    <label for="email">EMAIL ADDRESS</label>
    <input type="email" id="email" name="email" placeholder="you@example.com" required>

    <label for="phone">PHONE NUMBER</label>
    <input type="tel" id="phone" name="phone" placeholder="+91 XXXXX XXXXX">

    <label for="category">CATEGORY</label>
    <select id="category" name="category" required>
      <option value="" disabled selected>Select category</option>
      <option value="Male">Male</option>
      <option value="Female">Female</option>
    </select>

    <button type="submit" class="submit-btn" id="submitBtn">ENTER THE ARENA</button>
  </form>

  <div class="msg" id="msg"></div>
  <div class="reg-id-box" id="regIdBox">
    <span class="reg-id-label">YOUR REGISTRATION ID</span>
    <div class="reg-id-val" id="regIdVal"></div>
    <p style="font-size:11px;opacity:0.5;margin-top:12px;letter-spacing:2px;">Save this. You'll use it to view your scores.</p>
  </div>
</div>

<script>
const APPS_SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';

document.getElementById('regForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  btn.textContent = 'SUBMITTING...';
  msg.textContent = '';
  msg.className = 'msg';

  const body = {
    action: 'register',
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    category: document.getElementById('category').value,
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('regForm').style.display = 'none';
      msg.textContent = 'Registration successful!';
      msg.className = 'msg success';
      document.getElementById('regIdVal').textContent = data.reg_id;
      document.getElementById('regIdBox').style.display = 'block';
    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong. Please try again.';
    msg.className = 'msg error';
    btn.disabled = false;
    btn.textContent = 'ENTER THE ARENA';
  }
});
</script>
</body>
</html>
```

- [ ] **Step 2: Replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE` with the actual URL from Task 7**

- [ ] **Step 3: Open `register/index.html` in browser, test form submission end-to-end**

Fill in test data → click submit → check Registrations sheet → verify reg_id appears on screen.

- [ ] **Step 4: Commit**

```bash
git add register/index.html
git commit -m "feat: add registration form page with Google Sheets backend"
```

---

## Task 9: Build public leaderboard page

**Files:**
- Create: `scores/index.html`

Athletes navigate here to see their ranking and scores after each round.

- [ ] **Step 1: Create `scores/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scores — RANNBHOOMI 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../images/logo-crimson.png">
<style>
:root { --crimson:#4c0007; --gold:#dec189; --text:#4c0007; --crimson-border:rgba(76,0,7,0.28); }
* { margin:0; padding:0; box-sizing:border-box; }
body {
  min-height:100vh;
  background:#d6b97a url('../images/parchment.png') center/cover fixed;
  font-family:'Cinzel',serif; color:var(--text);
  padding:60px 5vw;
}
.back-link { font-size:11px; letter-spacing:3px; color:var(--crimson); opacity:0.6; text-decoration:none; }
.back-link:hover { opacity:1; }
.page-label { font-size:10px; letter-spacing:6px; opacity:0.4; margin:40px 0 14px; display:block; }
.page-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(44px,7vw,84px); letter-spacing:4px; color:var(--crimson); line-height:1; }
.page-rule { width:70px; height:2px; background:var(--crimson); opacity:0.35; margin:18px 0 48px; }
.controls { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:40px; }
.ctrl-btn {
  padding:10px 22px; border:1px solid var(--crimson-border);
  background:transparent; font-family:'Cinzel',serif; font-size:10px;
  letter-spacing:3px; color:var(--crimson); cursor:pointer; transition:.2s;
}
.ctrl-btn.active { background:var(--crimson); color:var(--gold); }
.ctrl-btn:hover:not(.active) { background:rgba(76,0,7,0.08); }
.search-wrap { margin-bottom:32px; }
.search-wrap input {
  width:100%; max-width:400px; padding:12px 16px;
  border:1px solid var(--crimson-border); background:rgba(214,185,122,0.4);
  font-family:'Cinzel',serif; font-size:13px; color:var(--crimson); outline:none;
}
.search-wrap input:focus { border-color:var(--crimson); }
.scores-table { width:100%; border-collapse:collapse; max-width:900px; }
.scores-table th {
  font-size:9px; letter-spacing:3px; opacity:0.5;
  padding:10px 16px; text-align:left; border-bottom:1px solid var(--crimson-border);
}
.scores-table td { padding:14px 16px; border-bottom:1px solid rgba(76,0,7,0.08); font-size:13px; }
.scores-table tr:hover td { background:rgba(76,0,7,0.04); }
.rank-1 td:first-child { font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--gold); }
.rank-badge { font-family:'Bebas Neue',sans-serif; font-size:20px; letter-spacing:1px; }
.loading { font-size:12px; letter-spacing:3px; opacity:0.4; margin-top:40px; }
.highlight { background:rgba(76,0,7,0.12) !important; font-weight:600; }
</style>
</head>
<body>
<a class="back-link" href="../">← BACK TO RANNBHOOMI</a>
<span class="page-label">Competition Results</span>
<h1 class="page-title">LEADERBOARD</h1>
<div class="page-rule"></div>

<div class="controls">
  <button class="ctrl-btn active" onclick="setRound(1)">Round 1 — Qualifiers</button>
  <button class="ctrl-btn" onclick="setRound(2)">Round 2 — Semi-Finals</button>
  <button class="ctrl-btn" onclick="setRound(3)">Round 3 — Finals</button>
  <button class="ctrl-btn" id="catBtn" onclick="toggleCategory()">Showing: Male</button>
</div>

<div class="search-wrap">
  <input type="text" id="search" placeholder="SEARCH ATHLETE NAME..." oninput="renderTable()">
</div>

<div id="tableWrap"><p class="loading">Loading scores...</p></div>

<script>
const APPS_SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';
let allScores = [];
let currentRound = 1;
let currentCategory = 'male';

async function loadScores() {
  document.getElementById('tableWrap').innerHTML = '<p class="loading">Loading...</p>';
  try {
    const url = `${APPS_SCRIPT_URL}?action=scores&round=${currentRound}&category=${currentCategory}`;
    const res = await fetch(url);
    const data = await res.json();
    allScores = data.scores || [];
    renderTable();
  } catch (e) {
    document.getElementById('tableWrap').innerHTML = '<p class="loading">Failed to load scores. Check back later.</p>';
  }
}

function renderTable() {
  const query = document.getElementById('search').value.toLowerCase();
  const filtered = allScores.filter(r => r.name.toLowerCase().includes(query));
  if (!filtered.length) {
    document.getElementById('tableWrap').innerHTML = '<p class="loading">No scores yet.</p>';
    return;
  }
  const headers = Object.keys(filtered[0]).filter(k => k !== 'rank');
  let html = `<table class="scores-table"><thead><tr>
    <th>RANK</th>
    ${headers.map(h => `<th>${h.replace(/_/g,' ').toUpperCase()}</th>`).join('')}
  </tr></thead><tbody>`;
  filtered.forEach((row, i) => {
    const rankClass = i === 0 ? 'rank-1' : '';
    html += `<tr class="${rankClass}">
      <td><span class="rank-badge">${row.rank}</span></td>
      ${headers.map(h => `<td>${row[h] ?? '—'}</td>`).join('')}
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('tableWrap').innerHTML = html;
}

function setRound(r) {
  currentRound = r;
  document.querySelectorAll('.ctrl-btn').forEach((b, i) => {
    if (i < 3) b.classList.toggle('active', i === r - 1);
  });
  loadScores();
}

function toggleCategory() {
  currentCategory = currentCategory === 'male' ? 'female' : 'male';
  document.getElementById('catBtn').textContent = `Showing: ${currentCategory === 'male' ? 'Male' : 'Female'}`;
  loadScores();
}

loadScores();
</script>
</body>
</html>
```

- [ ] **Step 2: Replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE`**

- [ ] **Step 3: Test with manually added score data**

Add a test row to `Round1_Scores` in the Google Sheet, then open `scores/index.html` in browser → verify row appears in table.

- [ ] **Step 4: Add "Scores" link to main site nav**

In `index.html`, find the `<ul class="nav-links">` and add:

```html
<li><a href="scores/">Leaderboard</a></li>
```

Add it before the "Register" nav item.

- [ ] **Step 5: Commit**

```bash
git add scores/index.html index.html
git commit -m "feat: add public leaderboard page and nav link"
```

---

## Task 10: Build judge score entry portal

**Files:**
- Create: `judge/index.html`

Race day judges use this on a tablet/phone. PIN-protected. Allows selecting athlete ID, round, and entering scores per station.

- [ ] **Step 1: Create `judge/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Judge Portal — RANNBHOOMI 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../images/logo-crimson.png">
<style>
:root { --crimson:#4c0007; --gold:#dec189; --text:#4c0007; --crimson-border:rgba(76,0,7,0.28); }
* { margin:0; padding:0; box-sizing:border-box; }
body { min-height:100vh; background:#d6b97a url('../images/parchment.png') center/cover fixed; font-family:'Cinzel',serif; color:var(--text); padding:40px 5vw; }
.panel { max-width:600px; margin:0 auto; }
.page-title { font-family:'Bebas Neue',sans-serif; font-size:52px; letter-spacing:4px; color:var(--crimson); }
.page-rule { width:60px; height:2px; background:var(--crimson); opacity:0.35; margin:14px 0 36px; }
.pin-screen { display:block; }
.score-screen { display:none; }
label { display:block; font-size:10px; letter-spacing:3px; opacity:0.5; margin-bottom:8px; margin-top:20px; }
input, select {
  width:100%; padding:13px 16px; border:1px solid var(--crimson-border);
  background:rgba(214,185,122,0.4); font-family:'Cinzel',serif;
  font-size:13px; color:var(--crimson); outline:none;
}
input:focus, select:focus { border-color:var(--crimson); background:rgba(214,185,122,0.7); }
input[type="number"] { -moz-appearance:textfield; }
.btn {
  display:block; width:100%; margin-top:28px; padding:16px;
  background:var(--crimson); color:var(--gold); font-family:'Bebas Neue',sans-serif;
  font-size:18px; letter-spacing:4px; border:none; cursor:pointer; transition:.2s;
}
.btn:hover { opacity:.85; }
.btn:disabled { opacity:.4; cursor:not-allowed; }
.btn-secondary { background:transparent; color:var(--crimson); border:1px solid var(--crimson-border); font-size:14px; margin-top:12px; }
.scores-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
.msg { margin-top:20px; font-size:12px; letter-spacing:2px; min-height:20px; text-align:center; }
.msg.success { color:#1a6b00; }
.msg.error { color:var(--crimson); }
</style>
</head>
<body>
<div class="panel">
  <div style="font-size:10px;letter-spacing:4px;opacity:0.4;margin-bottom:14px;">JUDGE ACCESS</div>
  <h1 class="page-title">SCORE ENTRY</h1>
  <div class="page-rule"></div>

  <!-- PIN screen -->
  <div class="pin-screen" id="pinScreen">
    <label for="pinInput">JUDGE PIN</label>
    <input type="password" id="pinInput" placeholder="Enter PIN" maxlength="10">
    <button class="btn" onclick="verifyPin()">ENTER</button>
    <div class="msg" id="pinMsg"></div>
  </div>

  <!-- Score entry screen -->
  <div class="score-screen" id="scoreScreen">
    <label for="roundSelect">ROUND</label>
    <select id="roundSelect" onchange="updateStationFields()">
      <option value="1">Round 1 — Qualifiers</option>
      <option value="2">Round 2 — Semi-Finals</option>
      <option value="3">Round 3 — Finals</option>
    </select>

    <label for="athleteId">ATHLETE ID</label>
    <input type="text" id="athleteId" placeholder="e.g. RB123456">

    <div id="stationFields"></div>

    <button class="btn" id="submitScoreBtn" onclick="submitScore()">SUBMIT SCORE</button>
    <button class="btn btn-secondary" onclick="resetForm()">CLEAR FORM</button>
    <div class="msg" id="scoreMsg"></div>
  </div>
</div>

<script>
const APPS_SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';

const ROUND_STATIONS = {
  '1': ['s1_burpees','s2_bike','s3_lunges','s4_pushups','s5_sprint','s6_inchworms','s7_squats'],
  '2': ['rowing','devils_press','kb_walk','box_jump'],
  '3': ['weight_total','time_seconds'],
};

const STATION_LABELS = {
  s1_burpees:'Burpees (reps)', s2_bike:'Erg Bike (metres)', s3_lunges:'Lunges (reps)',
  s4_pushups:'Push Ups (reps)', s5_sprint:'Sprint (20m lengths)', s6_inchworms:'Inch Worms (reps)',
  s7_squats:'DB Front Squats (reps)', rowing:'Rowing (cals)', devils_press:"Devil's Press (reps)",
  kb_walk:'KB Walk (20m lengths)', box_jump:'Box Jumps (reps)',
  weight_total:'Total Weight (kg)', time_seconds:'Finish Time (seconds)',
};

let judgePin = '';

function verifyPin() {
  judgePin = document.getElementById('pinInput').value;
  if (!judgePin) return;
  document.getElementById('pinScreen').style.display = 'none';
  document.getElementById('scoreScreen').style.display = 'block';
  updateStationFields();
}

function updateStationFields() {
  const round = document.getElementById('roundSelect').value;
  const stations = ROUND_STATIONS[round];
  let html = '<div class="scores-grid">';
  stations.forEach(s => {
    html += `<div>
      <label for="${s}">${STATION_LABELS[s].toUpperCase()}</label>
      <input type="number" id="${s}" name="${s}" placeholder="0" min="0" step="0.5">
    </div>`;
  });
  html += '</div>';
  document.getElementById('stationFields').innerHTML = html;
}

async function submitScore() {
  const btn = document.getElementById('submitScoreBtn');
  const msg = document.getElementById('scoreMsg');
  const round = document.getElementById('roundSelect').value;
  const athleteId = document.getElementById('athleteId').value.trim();
  if (!athleteId) { msg.textContent = 'Enter an athlete ID'; msg.className = 'msg error'; return; }

  const stations = ROUND_STATIONS[round];
  const scores = {};
  stations.forEach(s => { scores[s] = parseFloat(document.getElementById(s)?.value || 0) || 0; });

  btn.disabled = true; btn.textContent = 'SUBMITTING...';
  msg.textContent = ''; msg.className = 'msg';

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'score', pin:judgePin, round, athlete_id:athleteId, scores }),
    });
    const data = await res.json();
    if (data.success) {
      msg.textContent = `Score saved. Total: ${data.total} pts`;
      msg.className = 'msg success';
      resetForm();
    } else {
      throw new Error(data.error || 'Failed');
    }
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg error';
  }
  btn.disabled = false; btn.textContent = 'SUBMIT SCORE';
}

function resetForm() {
  document.getElementById('athleteId').value = '';
  updateStationFields();
}

updateStationFields();
</script>
</body>
</html>
```

- [ ] **Step 2: Replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE`**

- [ ] **Step 3: Test end-to-end on mobile (simulate tablet use)**

Open in browser → enter PIN (from Config sheet) → select Round 1 → enter test athlete ID → enter scores → submit → verify row appears in Round1_Scores sheet.

- [ ] **Step 4: Commit**

```bash
git add judge/index.html
git commit -m "feat: add judge score entry portal with PIN auth"
```

---

## Task 11: Deploy to GitHub Pages

**Files:**
- Create: `.github/` (optional for CI)

- [ ] **Step 1: Initialize git repo if not already done**

```bash
git init
git add -A
git commit -m "feat: initial Rannbhoomi website v2"
```

- [ ] **Step 2: Create GitHub repository**

Go to github.com → New repository → Name: `rannbhoomi` → Public (required for free Pages) → Create.

- [ ] **Step 3: Push and enable Pages**

```bash
git remote add origin https://github.com/YOUR_USERNAME/rannbhoomi.git
git branch -M main
git push -u origin main
```

Then: GitHub repo → Settings → Pages → Source: Deploy from branch → Branch: `main` → Root folder `/` → Save.

- [ ] **Step 4: Verify site is live**

Visit `https://YOUR_USERNAME.github.io/rannbhoomi/` — main site should load. Check `register/`, `scores/`, `judge/` pages all load.

- [ ] **Step 5: (Optional) Add custom domain**

In GitHub Pages settings, add a custom domain like `rannbhoomi.in`. Update DNS with a CNAME record pointing to `YOUR_USERNAME.github.io`.

---

## Self-Review

**Spec coverage check:**
- ✅ Website visual fixes (duplicate text, contact links, font readability, mobile nav)
- ✅ Monolithic file broken into maintainable structure
- ✅ Athlete registration → Google Sheets
- ✅ Scores/leaderboard for athletes to view rankings
- ✅ Judge portal with PIN for race day score entry
- ✅ Zero-cost hosting (GitHub Pages) + Zero-cost backend (Apps Script + Sheets)
- ✅ Countdown timer added to hero
- ✅ Favicon added

**Placeholder check:**
- ⚠️ `PASTE_YOUR_APPS_SCRIPT_URL_HERE` appears in Tasks 8, 9, 10 — these must be replaced with the actual deployed URL from Task 7 before those pages work.
- ⚠️ `EVENT_DATE` in the countdown timer uses a placeholder date — update when the event date is confirmed.
- ⚠️ `CHANGE_THIS_PIN` in Config sheet — must be changed before race day.

**Type consistency:** All Apps Script handler functions use `action` as the discriminator, consistent across all pages. Score column names (`s1_burpees` etc.) are defined once in `ROUND_STATIONS` in the judge portal and match the sheet headers.
