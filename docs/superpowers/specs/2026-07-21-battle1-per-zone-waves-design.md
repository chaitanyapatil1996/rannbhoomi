# Battle 1 — Per-Zone Wave Lifecycle (Revision)

**Date:** 2026-07-21
**Event:** Rannbhoomi 2026, Rajaram Bhiku Pathare Stadium, Pune
**Supersedes:** `2026-07-20-battle1-checkin-wave-scoring-design.md` §5 ("Wave
lifecycle") and its admin-panel wave management — everything else in that
spec (Checkins as roster source of truth, station judges' wave-scoped
batch scoring, Late Entry) is unchanged.

## Why

Live-testing surfaced a real design mistake: wave activation was built as
one shared switch across all 4 zones (`Waves.status` keyed only by
`wave_num`). But the organizer runs zones independently, staggered 10-15
minutes apart — Zone A can be well into Wave 2 while Zone B is still
starting Wave 1. Under the shared-switch model:

- There's no way to activate a wave for one zone without it silently
  affecting all four.
- Wave completion (checked across all 4 zones together) can fire while a
  lagging zone hasn't even started that wave, and there's no way to reopen
  a wave that completed prematurely.
- A station judge's roster resolves whichever wave is globally "Active,"
  which doesn't necessarily match what's actually been checked in for
  their own zone — this is the likely cause of a live-tested "judge UI
  shows no athletes" report even within the same zone as a working judge.

The organizer also flagged that a separate admin "Waves" section adds an
unneeded coordinating role — check-in staff already own their zone
end-to-end (who's present), so they should also own when that zone's wave
starts and (rarely) when it needs to be force-closed. This mirrors Gym
Battle's "one clear owner" pattern (Front Squats owns rotation) rather than
splitting zone lifecycle across a check-in PIN and a separate admin
operator.

## What's staying as-is

- `Checkins` sheet and its role as the roster source of truth — unchanged.
- Station judges' wave-scoped roster + batch submit
  (`battle1_submit_wave`) — unchanged in shape, just resolves "the active
  wave" per-zone now instead of globally.
- `admin/index.html`'s original three actions (Clear Scores, Release
  Leaderboard, Rebuild Leaderboard) — unchanged. Its "Waves" section
  (added in the prior implementation) is removed entirely.

## 1. Data model — `Waves` becomes per-zone

`Waves` sheet columns change from `(wave_num, status)` to `(wave_num, zone,
status)` — one row per (wave, zone) pair, not one row per wave. Each zone
tracks its own Draft → Active → Complete progress completely independently
of the other three.

`setupWavesSheet()` changes to populate one row per (distinct wave number
in `Athletes.wave`) × (each of the 4 zones), all starting Draft — so a
fresh setup produces 4× the rows it did before.

## 2. Check-in becomes the zone's full lifecycle owner

`judge/checkin.html` (already built) gains two new capabilities, both
scoped to the check-in PIN's own zone only:

- **ACTIVATE WAVE** — activates the selected wave for this zone. Blocks
  only if a *different* wave is already Active for the *same* zone
  (re-activating the same wave, or activating when nothing else is Active
  for this zone, both succeed) — the "one Active wave at a time" rule now
  applies per-zone, not globally.
- **FORCE COMPLETE** — manual override shown when the selected wave is
  Active for this zone, for the same reason as before (a withdrawn/injured
  athlete could otherwise block that zone's wave from ever auto-completing
  and block activating the next one for that zone).

The wave selector's list of open waves becomes zone-scoped too — it was
already check-in-PIN-specific, this just makes "which waves are open"
reflect this zone's own status column instead of a shared list.

## 3. Battle 1 station judges — zone-scoped active wave

`battle1Roster` resolves "the active wave" for the judge's own zone only
(not a single global value) — a station judge in Zone A never sees Zone
B's wave state, and vice versa. Late Entry's wave list is scoped the same
way (a station judge only ever works one zone, so cross-zone Late Entry
was never meaningful).

## 4. Wave completion — per (wave, zone), not per wave

Auto-completion checks only the checked-in athletes for **that zone**
(not all 4) — this is simpler than the prior cross-zone check and
directly removes the premature-completion risk flagged in the earlier
whole-branch review, since one zone's progress no longer depends on, or
interferes with, the others at all.

## 5. Admin panel — reverts to its original scope

Remove the "Waves" section, and its three backend actions
(`admin_waves_overview`, `admin_activate_wave`, `admin_complete_wave`)
entirely — wave lifecycle is now fully owned by check-in, per zone. The
admin panel goes back to exactly Clear Scores / Release Leaderboard /
Rebuild Leaderboard (plus whatever the organizer adds later, out of scope
here).

## Confirmed assumptions

1. Zones run independently and are not expected to be on the same wave
   number at the same time — this was always the real operational model,
   just not what the first implementation assumed. ✅
2. Check-in PIN is the single owner of a zone's entire wave lifecycle:
   check-in, activation, and force-complete. No separate admin role for
   this. ✅
3. Admin panel keeps only its original three actions — wave management
   does not belong there. ✅
4. Per-zone completion is simpler and strictly safer than the prior
   cross-zone check (removes the premature-completion/no-reopen gap
   entirely, rather than needing a bolt-on REOPEN button). ✅

No open items remain — spec is ready to implement.
