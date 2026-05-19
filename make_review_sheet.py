#!/usr/bin/env python3
"""Build Rannbhoomi_Review.xlsx — each section gets its own screenshot."""
import zipfile, struct, os

OUT     = "/mnt/c/Users/chait/test/rannbhoomi/Rannbhoomi_Review.xlsx"
SEC_DIR = "/mnt/c/Users/chait/test/rannbhoomi/images/sections"

IMG_FILES = [
    "00_nav.png", "01_hero.png", "02_about.png", "03_format.png",
    "04_stations.png", "05_rules.png", "06_venue.png", "07_registration.png",
    "08_faq.png", "09_contact.png", "10_footer.png",
]

def png_dims(path):
    with open(path, 'rb') as f:
        d = f.read(24)
    return struct.unpack('>I', d[16:20])[0], struct.unpack('>I', d[20:24])[0]

IMG_CX = 3_200_000   # fixed width in EMU for all images (~336 px)

# Per-image data: (path, img_bytes, cx, cy, row_height_pt)
images = []
for fname in IMG_FILES:
    p = os.path.join(SEC_DIR, fname)
    with open(p, 'rb') as f:
        data = f.read()
    w, h = png_dims(p)
    cy = int(IMG_CX * h / w)
    ht = max(round(cy / 12700) + 6, 80)   # row height in points
    images.append({'path': p, 'data': data, 'cx': IMG_CX, 'cy': cy, 'ht': ht})

# ── Section names + Claude's remarks ─────────────────────────────────────────

SECTIONS = [

("NAVIGATION / HEADER", """\
1. No active/current-section indicator.
   Nav links have no highlighted state showing which section the user is on.
   Consider a JS scroll-spy that adds an 'active' class to the current link.

2. Nav brand 'RANNBHOOMI' text duplicates the hero wordmark directly below.
   On desktop both are visible at the same time — feels redundant.
   Could keep just the logo mark in the nav and drop the text span.

3. Mobile nav has no visible close affordance.
   The hamburger toggles open, but there is no × icon or visual close signal.
   Users may not realise clicking the hamburger again closes the menu.

4. backdrop-filter: blur(6px) has limited support on older Firefox / some Android.
   The nav background becomes fully transparent on unsupported browsers.
   Add a solid fallback: background: rgba(214,185,122,0.98) as a safe default.

5. 'Leaderboard' link is shown pre-event when scores don't exist yet.
   Pre-event visitors clicking it will see a 'Loading scores...' spinner forever.
   Consider hiding it or showing a 'Live on race day' placeholder until the event."""),

("HERO", """\
1. CRITICAL — Countdown shows wrong date.
   EVENT_DATE in js/main.js is still '2027-01-01' (placeholder).
   Visitors see a meaningless countdown until this is updated.

2. CTA button mis-routes.
   'Enter the Arena' links to #registration (pricing cards on same page)
   not to register/index.html (actual form). User expects a form,
   gets a second button — likely causes drop-off.

3. No event date visible in hero.
   New visitors cannot tell when the event is.
   Venue section says 'TBA 2026' but it is buried far below the fold.
   Consider adding the date to hero pills or subtitle.

4. Two taglines say the same thing back-to-back.
   'The Arena Within' (subtitle) + 'The Real Battle Is Inside You' (tagline)
   carry identical meaning. One strong line is more impactful.

5. Countdown shows only Days : Hours : Mins — no seconds.
   Minor, but most event countdowns include seconds.

6. hero-eyebrow CSS class is defined in style.css but never used in HTML.
   Dead code — safe to delete."""),

("ABOUT", """\
1. Section label reads 'Brand Philosophy' instead of 'About the Event'.
   Athletes visiting the site want competition info, not brand theory.
   Rename to 'About' or 'About the Event' to set clear expectations.

2. About icon (logo) is hidden on mobile via display:none at <900px.
   The text column becomes a plain wall of text with no visual anchor.
   Consider showing a smaller inline logo or stat graphic on mobile.

3. Stats say '30 Qualify Each' and '10 Finalists Each' — 'Each' is ambiguous.
   First-time visitors will not know 'each' means 'each gender'.
   Spell it out: '30 per gender', '10 per gender'.

4. No mention of who organises this event.
   Athletes need to know the organiser, affiliated gym, or event history
   before committing to a registration fee.

5. About body is entirely philosophical, zero logistical info.
   Visitors who scroll past Hero still have no date, venue, fee, or
   experience level expected. Consider one practical sentence here."""),

("FORMAT", """\
1. Round 3 description says 'Workout announced on competition day' —
   but the Stations section below lists all Round 3 exercises in full.
   This is a direct contradiction. Decide: secret or revealed.

2. Round 2 intro text lists '500 Cal, 12 Reps, 100m' but the Stations
   table shows Rowing as '30 Cal (M) / 15 Cal (F)', not 500 Cal.
   Stale copy from an earlier draft — update to match the Stations table.

3. Round badges use 'Time Cap' for Rounds 1 & 2 but '10 Male · 10 Female'
   for Round 3 — inconsistent badge semantics across round cards.

4. Round 1 includes operational detail ('4 athletes compete at a time
   across a 2 hour 40 minute window') inside the format overview.
   This level of scheduling detail belongs in a logistics/FAQ entry,
   not the at-a-glance format cards."""),

("STATIONS", """\
1. Round 1 has a 'Time' column; Rounds 2 & 3 have a 'Scoring' column.
   Users need to re-read the table structure on every tab switch.
   Standardise to one consistent column schema across all three tabs.

2. 'Sprint with Weights' in Round 1 shows Weight = '—' with no load specified.
   The name implies additional weight — either specify it or rename the movement.

3. Table body uses Cinzel (display font) at 13px with wide letter-spacing.
   Data tables are harder to scan with a display font vs. a neutral sans-serif.
   Consider system-ui or a simple sans for table cell data only.

4. On mobile (<600px) table font drops to 11px Cinzel — very tight in a
   horizontally scrolling table. A card-per-row layout would be more usable.

5. 'Sprint to Finish' in Round 3 shows Scoring = 'Stops Clock' with no
   point value. Athletes preparing for scoring strategy have no data here."""),

("RULES", """\
1. Rule 4 is labelled 'Eco Bike Standards' but the workout is called 'Erg Bike'
   everywhere else (Format, Stations, FAQ). Inconsistent naming — standardise.

2. Only 6 rules shown. Missing published standards for:
   Lunges, Squats, Devil's Press, Box Jump, Sled Push, Sandbag Back Throw,
   Thrusters, Rowing. Athletes have no standards to train to for these movements.

3. Decorative rule numbers (01–06) have opacity: 0.15 — nearly invisible.
   Increase to 0.20–0.22 for a subtle but readable decorative element.

4. Scoring is repeated across Rules, Stations table, and FAQ.
   Three places with the same point values creates maintenance risk.
   Consider a single canonical scoring reference and link from the others.

5. No mention of protest procedure or how disputed no-reps are handled
   beyond 'referee decision is final'. A note on the dispute process
   sets professional expectations."""),

("VENUE", """\
1. Entire venue section is placeholder — no address, no confirmed date, no map.
   This is acceptable pre-launch but should be the first section updated
   once details are confirmed. Venue + date is the #1 athlete question.

2. Date appears as 'TBA 2026' in the venue meta AND the Venue section header.
   Once the date is set, it must be updated in multiple locations.
   Consider a single JS constant (like EVENT_DATE) that renders the date
   everywhere automatically.

3. No map placeholder or directions link.
   Even a static 'View on Google Maps' anchor for 'Pune, Maharashtra' would
   be more useful than the current blank placeholder box.

4. Venue meta boxes (Date / Format / City) contain very short values.
   'Solo' and 'Pune' feel under-utilised in large Bebas Neue format boxes.
   Could add: Parking, Nearest Landmark, Registration Deadline."""),

("REGISTRATION", """\
1. '.reg-card.featured' style (crimson background) is defined in CSS
   but not applied to either pricing card in the HTML.
   One category should be featured, or the unused style should be removed.

2. Prices show '₹TBA' — athletes cannot assess whether to register.
   Even a 'Starting from ₹X' or 'Early bird: ₹X' gives enough signal.

3. 'Registration opens soon' text appears below a 'Register Now' button
   that links to an active form at register/index.html.
   Mixed messaging — button implies open, tagline implies not yet open.
   Align these: either disable the button or remove the 'opens soon' copy.

4. 'Early bird pricing available' on both cards has no deadline date.
   An urgency-free early-bird offer has no persuasive effect. Add a date.

5. The Register Now button links to register/index.html but the hero CTA
   links to #registration (this section). Two different flows for
   the same intent — standardise both CTAs to go to register/index.html."""),

("FAQ", """\
1. FAQ answer for 'When will the Finals workout be announced?' lists
   all Round 3 exercises in full detail. This directly contradicts
   the Format section which says the workout is revealed on competition day.

2. No FAQ about registration fees, cancellation, or refund policy.
   These are among the first questions athletes ask before paying.

3. No FAQ about age requirements, fitness level, or prerequisites.
   Who is this event designed for? A beginner vs. competitive athlete
   distinction would help filter appropriate registrants.

4. No FAQ about wave timing, check-in, or on-the-day schedule.
   Athletes travelling to Pune need to plan their day — even approximate
   timings would reduce pre-event support messages.

5. FAQ answers use max-height: 400px for open/close animation.
   If any answer exceeds 400px of rendered height it will be clipped.
   Test with longest answer and increase the cap if needed."""),

("CONTACT", """\
1. Instagram URL (instagram.com/rannbhoomi) and email (hello@rannbhoomi.com)
   may not exist yet. Verify both are live before going public —
   a broken social link or bouncing email destroys first impressions.

2. No WhatsApp contact option.
   For an Indian fitness event, WhatsApp is a primary support channel.
   A wa.me link would be more accessible than email for many athletes.

3. The contact section tagline ('The greatest battlefield is not outside...')
   repeats the same warrior-arena concept as the hero AND footer.
   The idea appears three times on one page — once is more impactful.

4. Location box is a plain div, not an anchor.
   Instagram and Email boxes link out correctly.
   The Location box could at minimum link to a Google Maps search
   for 'Pune Maharashtra' as a temporary placeholder."""),

("FOOTER", """\
1. Footer logo (logo-gold.png) has opacity: 0.6 — slightly dim on crimson.
   Increase to 0.75–0.80 for a crisper brand mark in the footer.

2. Footer quick-links omit 'Register' and 'Leaderboard'.
   These are the two highest-value destinations on the site.
   Both should appear in the footer for users who scroll to the bottom.

3. ft-links a opacity is 0.55 — on a crimson background, gold at 55%
   can feel washed out. Increase to 0.65–0.70 for better legibility.

4. Three tagline variations compete across the page:
   Hero: 'The Real Battle Is Inside You'
   Contact: 'The greatest battlefield is not outside...'
   Footer: 'Forged through battle'
   One consistent sub-brand line used everywhere would have more impact.

5. No social media icon in the footer — only a text link to Instagram.
   A small SVG icon would make the link more immediately recognisable."""),

]

# ── XML helpers ───────────────────────────────────────────────────────────────

def x(s):
    return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

# Build shared strings table
# [0]=Section [1]=Screenshot/Visual [2]=Remarks by Claude [3]=Remarks by User
# Then pairs: [4+2i]=section_name, [5+2i]=remarks
BASE_STRINGS = ["Section", "Screenshot / Visual", "Remarks by Claude", "Remarks by User"]
all_strings  = BASE_STRINGS[:]
for name, remarks in SECTIONS:
    all_strings.append(name)
    all_strings.append(remarks)

si_items = "\n".join(
    f'  <si><t xml:space="preserve">{x(s)}</t></si>' for s in all_strings
)

# ── File templates ────────────────────────────────────────────────────────────

CONTENT_TYPES = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Default Extension="png"  ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml"           ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"  ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml"             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml"      ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml"  ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>"""
# Note: PNG files use the Default Extension="png" rule above — no Override needed per file.

RELS = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

WORKBOOK = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Website Review" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"""

WORKBOOK_RELS = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"     Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"        Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>"""

STYLES = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="12"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><name val="Calibri"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4C0007"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2E4C4"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left   style="thin"><color rgb="FF4C0007"/></left>
      <right  style="thin"><color rgb="FF4C0007"/></right>
      <top    style="thin"><color rgb="FF4C0007"/></top>
      <bottom style="thin"><color rgb="FF4C0007"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0"
        applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0"
        applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"
        applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"
        applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0"
        applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>"""

# ── Sheet data ────────────────────────────────────────────────────────────────

n = len(SECTIONS)

def col_letters(r): return str(r)  # using numeric row refs

rows_xml = []
# Header row
rows_xml.append(
    '<row r="1" ht="28" customHeight="1">'
    '<c r="A1" t="s" s="1"><v>0</v></c>'
    '<c r="B1" t="s" s="1"><v>1</v></c>'
    '<c r="C1" t="s" s="1"><v>2</v></c>'
    '<c r="D1" t="s" s="1"><v>3</v></c>'
    '</row>'
)
for i, ((name, _), img) in enumerate(zip(SECTIONS, images)):
    r    = i + 2
    si_n = 4 + i * 2
    si_r = 5 + i * 2
    rows_xml.append(
        f'<row r="{r}" ht="{img["ht"]}" customHeight="1">'
        f'<c r="A{r}" t="s" s="2"><v>{si_n}</v></c>'
        f'<c r="B{r}"        s="5"/>'
        f'<c r="C{r}" t="s" s="3"><v>{si_r}</v></c>'
        f'<c r="D{r}"        s="4"/>'
        f'</row>'
    )

SHEET = f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="22"  customWidth="1"/>
    <col min="2" max="2" width="50"  customWidth="1"/>
    <col min="3" max="3" width="72"  customWidth="1"/>
    <col min="4" max="4" width="52"  customWidth="1"/>
  </cols>
  <sheetData>
    {''.join(rows_xml)}
  </sheetData>
  <drawing r:id="rId1"/>
</worksheet>"""

SHEET_RELS = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>"""

# ── Drawing — one anchor per row, each referencing its own image ─────────────

def anchor(row_0based, pic_id, rid, cx, cy):
    return f"""\
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>1</xdr:col><xdr:colOff>40000</xdr:colOff>
      <xdr:row>{row_0based}</xdr:row><xdr:rowOff>40000</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="{cx}" cy="{cy}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="{pic_id}" name="Section_{pic_id}"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="{rid}"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>"""

anchors = "\n".join(
    anchor(i + 1, i + 2, f"rId{i+1}", images[i]['cx'], images[i]['cy'])
    for i in range(n)
)

DRAWING = f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
{anchors}
</xdr:wsDr>"""

drawing_rel_items = "\n".join(
    f'  <Relationship Id="rId{i+1}" '
    f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
    f'Target="../media/sec_{i:02d}.png"/>'
    for i in range(n)
)
DRAWING_RELS = f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{drawing_rel_items}
</Relationships>"""

SHARED_STRINGS = f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
     count="{len(all_strings)}" uniqueCount="{len(all_strings)}">
{si_items}
</sst>"""

# ── Assemble ──────────────────────────────────────────────────────────────────

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('[Content_Types].xml',                CONTENT_TYPES)
    zf.writestr('_rels/.rels',                         RELS)
    zf.writestr('xl/workbook.xml',                     WORKBOOK)
    zf.writestr('xl/_rels/workbook.xml.rels',          WORKBOOK_RELS)
    zf.writestr('xl/styles.xml',                       STYLES)
    zf.writestr('xl/sharedStrings.xml',                SHARED_STRINGS)
    zf.writestr('xl/worksheets/sheet1.xml',            SHEET)
    zf.writestr('xl/worksheets/_rels/sheet1.xml.rels', SHEET_RELS)
    zf.writestr('xl/drawings/drawing1.xml',            DRAWING)
    zf.writestr('xl/drawings/_rels/drawing1.xml.rels', DRAWING_RELS)
    for i, img in enumerate(images):
        zf.writestr(f'xl/media/sec_{i:02d}.png', img['data'])

print(f"Created : {OUT}")
print(f"Size    : {os.path.getsize(OUT):,} bytes")
print(f"Sections: {n} rows, {n} unique screenshots embedded")
