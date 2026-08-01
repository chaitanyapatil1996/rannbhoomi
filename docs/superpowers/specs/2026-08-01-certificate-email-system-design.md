# Certificate Email System

**Date:** 2026-08-01
**Event:** Rannbhoomi 2026

## Why

Athletes can already view/print their certificate at `rannbhoomi.com/scores`,
but nothing proactively sends it to them. The organizer wants a post-event
wrap-up send — every Solo athlete and Gym Battle team gets their real
certificate emailed to them, plus a short personalized note about how they
did. This is modeled directly on `~/test/Prehab121/generate_certificates.js`
(a local Node script using `pdfkit` + `nodemailer`, with `--dry-run`/
`--test-to` safety flags and a per-run log), but adapted to reuse
Rannbhoomi's own live HTML certificate instead of hand-placing text on a
flat PNG template.

## Trigger & Scope

- **One-shot, post-event.** Run manually once, after all battles are
  scored and released — not per-battle, not automated.
- **Solo athletes:** everyone present in the Battle 1 leaderboard
  (`action=scores&round=1`, no `category` param → both genders). Anyone
  without a Round1_Scores row (no-show) is never in this list, so they're
  naturally excluded.
- **Gym Battle teams:** everyone in `action=gym_scores`. Requires a new
  `email` column (last column) added to the `Gym_Results` sheet — one
  email per team row (e.g. the captain's). Teams with no email are
  skipped and logged, same as solo athletes with no email on file.

## Architecture

A single Node script run locally by the organizer — no backend/Code.gs
changes, no redeploy.

```
send_certificates.js          ← new, repo root (alongside build_*.js, take_screenshots_*.js)
certificates/                 ← new, output dir for generated PDFs (gitignored)
certificate_log_<timestamp>.txt   ← new, per-run log (gitignored)
```

### Data fetch (no manual export — live API, unlike Prehab121's `.xlsx` download)

1. `GET {APPS_SCRIPT_URL}?action=scores&round=1` → full Battle 1 leaderboard,
   both genders, with every station's raw value + `total` + `gender_rank`.
   This is the base roster **and** the source for gap-analysis math (step
   below) — no separate fetch needed for the cutoff/top athletes.
2. For each athlete_id in that list: `GET ?action=athlete&athlete_id=X` →
   `{ athlete: {name, category, battle1_gender_rank}, rounds: {'1':{...}, '2'?:{...}, '3'?:{...}} }`.
   This is exactly what `renderCertificate(data)` on the live site consumes.
3. `GET ?action=gym_scores` → full Gym Battle team list (`rank, zone,
   team_name, front_squats, devils_press, rower, box_jump, team_score,
   email`). Each row is passed directly to `renderGymCertificate(team)` —
   no extra fetch needed per team.

### Certificate rendering (reuses the live page — no duplicate template)

For each athlete/team:

1. Puppeteer opens `https://rannbhoomi.com/scores/` (headless).
2. `page.evaluate(renderCertificate, athleteData)` (or `renderGymCertificate`
   for gym teams) — calls the page's own existing function directly, so the
   emailed PDF can never drift from what's live on the site.
3. `page.evaluate(() => document.getElementById('certOverlay').classList.add('open'))`.
4. `page.emulateMediaType('print')` — activates the site's existing
   `@media print` rule (`scores/index.html:278-283`) that already hides
   everything except `.cert-paper` for the "PRINT / SAVE PDF" button.
5. `page.pdf({ path, format: 'A4', printBackground: true })`.

Result: pixel-identical to what the athlete would get clicking "PRINT / SAVE
PDF" themselves.

### Gap analysis (Solo athletes who did NOT advance past Battle 1)

An athlete "advanced" if `data.rounds['2']` exists. For anyone who didn't:

1. From the Battle 1 leaderboard (already fetched, sorted by `total` desc
   per category), find:
   - `topAthlete` — rank 1 in their category (aspirational context).
   - `cutoffAthlete` — rank 30 in their category (the qualifying line).
2. `pointGap = cutoffAthlete.total - athlete.total`.
3. **Weakest-station callout:** for each of the 7 Battle 1 stations, compute
   `(cutoffAthlete[station] - athlete[station]) * pointsPerUnit`, using
   these fixed multipliers (matches the FAQ and `Scoring Table` sheet
   exactly — hardcode this table in the script, no need to fetch it):

   | Station key | Label | Points/unit |
   |---|---|---|
   | `s1_burpees` | Static Burpees | 10 / rep |
   | `s2_bike` | Erg Bike | 1 / metre |
   | `s3_lunges` | Deadlift | 10 / rep |
   | `s4_pushups` | Hand Release Push Ups | 5 / rep |
   | `s5_sprint` | Sprint with Weights | 20 / lap |
   | `s6_inchworms` | Inch Worms | 10 / rep |
   | `s7_squats` | DB Front Squats | 5 / rep |

   The station with the largest positive deficit is the one named in the
   email.
4. Email states: their rank + total, the point gap to 30th place, the
   winner's score for context, and the single station where they lost the
   most ground vs. the cutoff athlete at that same station.

Athletes who DID advance (Battle 2 and/or 3 data present) skip all of this
— their email just states which Battles they reached and their final
standing, generated from which `rounds` keys exist. No comparison math for
them.

## Email

- **From:** `frontline@rannbhoomi.com` (Gmail App Password, env var
  `GMAIL_APP_PASSWORD` — same pattern as Prehab121).
- **Transport:** `nodemailer`, `service: 'gmail'`.
- **Attachment:** the generated PDF.
- **Subject/body:** personalized per the Trigger & Scope / Gap analysis
  sections above. Exact copy is drafted during implementation and shown to
  the organizer before any real send (via `--test-to`) — not fixed in this
  spec.

## Safety (matches Prehab121 exactly)

- `--dry-run` — generates all PDFs into `certificates/`, sends no email.
- `--test-to=you@example.com` — renders + sends only the *first* athlete,
  to this address instead of their real one, then stops. For proofing the
  design/copy before a real send.
- A delay between sends (Prehab121 used 600ms) to stay well under Gmail's
  rate limits.
- A log file per run (`certificate_log_<timestamp>.txt`): one line per
  athlete/team — `SENT`, `SKIPPED` (no email on file), or `DRY RUN`, plus a
  final tally. Same shape as Prehab121's log.

## Data requirement before running

- `Gym_Results` needs an `email` column added (last column) — one email per
  team row. Without it, Gym Battle teams are skipped (logged, not an
  error).

## Out of scope

- Per-battle sends (only a single post-event run).
- Any backend/Code.gs changes — this is a pure client of the existing
  public API.
- Building a new certificate template — entirely reuses the live one.
