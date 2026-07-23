# Partner Logo Rotating Banner (Footer Marquee)

**Date:** 2026-07-23
**Event:** Rannbhoomi 2026

## Why

The footer currently has 5 empty `.ft-partner-logo` placeholder boxes
(`css/style.css:724-734`, `index.html` footer section) awaiting sponsor
logos. The organizer now has 16 actual logo files ready
(`images/brand logos/brand Collab logos/`) — too many to fit as static
boxes, so this replaces the static layout with a continuously scrolling
marquee.

## Design

- **Assets:** Copy the 16 PNGs into `images/partners/` (repo-relative path
  servable by GitHub Pages). Files: 2XU, Cafe Arabia, Enrich, Fitistan,
  Hyperice, JNB, Manant physio, Peakst8, Pocari Sweat, Robust Regime, Truly
  desi, avvatar, concept 2, oxycool, the whole truth, zoomin.
- **Structure:** Replace the current `.ft-partners` block (5 empty
  `.ft-partner-logo` divs) with a `.ft-marquee` wrapper
  (`overflow:hidden`, full footer width) containing one `.ft-marquee-track`
  flex row listing all 16 `<img>` logos **twice back-to-back** (list + list
  again) — this duplication is what makes the loop seamless.
- **Motion:** Pure CSS `@keyframes` translating the track from
  `translateX(0)` to `translateX(-50%)`, `linear infinite`, ~40s per full
  loop. `.ft-marquee:hover .ft-marquee-track { animation-play-state:
  paused; }` so desktop users can pause to read a logo. A
  `@media (prefers-reduced-motion: reduce)` override removes the animation
  and lets the track wrap normally (static row) — no JS required anywhere.
- **Per-logo styling:** No individual boxes/borders — each logo is
  `height:40px; width:auto; opacity:0.85` directly on the crimson footer
  background, `gap:48px` between logos. Opacity keeps 16 different brand
  colors from visually clashing against each other or the gold/crimson
  theme while staying clearly legible.
- **Removed:** The old `.ft-partner-logo` box CSS
  (`css/style.css:728-734`) and its 5 empty div placeholders in
  `index.html`.

## Scope

CSS + a static HTML `<img>` list in the footer only. No backend, no JS
(beyond the CSS-only hover/reduced-motion rules). No open items — ready to
implement directly given the size of this change.
