#!/usr/bin/env python3
"""Adds a 'Version 2' sheet to Rannbhoomi_Review.xlsx with fresh screenshots and critiques."""
import zipfile, struct, os, re, shutil

XLSX    = "/mnt/c/Users/chait/test/rannbhoomi/Rannbhoomi_Review.xlsx"
OUT     = "/mnt/c/Users/chait/test/rannbhoomi/Rannbhoomi_Review.xlsx"
SEC_DIR = "/mnt/c/Users/chait/test/rannbhoomi/images/sections_v2"

IMG_FILES = [
    "00_nav.png","01_hero.png","02_about.png","03_format.png",
    "04_stations.png","05_rules.png","06_venue.png","07_registration.png",
    "08_faq.png","09_contact.png","10_footer.png",
]

def png_dims(path):
    with open(path,'rb') as f: d=f.read(24)
    return struct.unpack('>I',d[16:20])[0], struct.unpack('>I',d[20:24])[0]

IMG_CX = 3_200_000
images = []
for fname in IMG_FILES:
    p = os.path.join(SEC_DIR, fname)
    with open(p,'rb') as f: data=f.read()
    w, h = png_dims(p)
    cy = int(IMG_CX * h / w)
    ht = max(round(cy/12700)+6, 80)
    images.append({'path':p,'data':data,'cx':IMG_CX,'cy':cy,'ht':ht})

# ── Version 2 critiques ───────────────────────────────────────────────────────
SECTIONS = [

("NAVIGATION / HEADER", """\
1. Crimson background with gold logo and white links is a strong improvement.
   The dark nav now matches the brand identity and anchors the page confidently.

2. Season 1 dropdown added correctly with TBA states for other regions.
   All TBA links go to '#' which feels broken on click. Add cursor:not-allowed
   and a hover tooltip 'Coming Soon' to signal they are placeholders.

3. REGISTER button gold colour pops well against crimson. However gold-on-crimson
   contrast is ~3.5:1, below WCAG AA (4.5:1). Increase button font size to 14px
   or darken the gold slightly to meet accessibility standards.

4. LEADERBOARD link still visible pre-event and leads to a blank spinner.
   Either hide it until race day or grey it out with 'Live on 12 July' text.

5. Season 1 dropdown only opens on hover (CSS :hover). On touch devices
   hover doesn't fire — the dropdown is invisible on mobile. Add a JS click
   handler so tapping 'Season 1' toggles the submenu on mobile."""),

("HERO", """\
1. CRITICAL — Background image is a screenshot of the old website.
   The hero now shows two RANNBHOOMI wordmarks and the old tagline bleeds through.
   Replace with an actual athlete or event photo for a clean, non-duplicating hero.

2. Countdown correctly counts to 12 July 2026 — event date is now live and accurate.
   Crimson numbers on the parchment-photo overlay lack contrast. Add a light
   semi-transparent pill behind the countdown block to lift it off the background.

3. Date and venue (12 July 2026 · Rajaram Bhiku Pathare Stadium) now visible in hero.
   This is the biggest UX improvement in v2 — first thing athletes need to see.
   The venue text is small (12px Cinzel). Bump to 13-14px for mobile legibility.

4. Enter the Arena correctly scrolls to Competition Format section now. Good fix.
   Consider adding a secondary smaller Register link just below the CTA button
   for athletes ready to sign up immediately.

5. WhatsApp floating ball is present but links to '#'. Wire it to
   wa.me/91XXXXXXXXXX before going live — a broken button on first visit
   damages trust immediately."""),

("ABOUT", """\
1. Athlete photo is a strong improvement over the logo. Real athletes on real
   equipment communicates the event feel and builds credibility.

2. The photo contains its own brand text overlay (RANNBHOOMI / THE ARENA WITHIN /
   BUILT BY THE ATHLETES. FOR THE ATHLETES.) which is correct by design.
   However the 'Built by the athletes' line requested for the hero ended up
   only visible here inside the photo, not in the hero section itself.

3. Section label still reads 'BRAND PHILOSOPHY'. Athletes scan for event info.
   Rename to 'About the Event' or simply 'About' for clarity.

4. Removing the stats table leaves the section ending abruptly after 3 paragraphs.
   The stats (3 Rounds / 30 Qualify / 10 per Gender) carried strong at-a-glance
   value. Consider a single highlight row: Prize Pool · Date · City instead.

5. About copy is entirely philosophical with zero logistical info.
   Add at least one practical sentence: date, venue, eligibility level."""),

("FORMAT", """\
1. Round 1 exercises correctly updated: Deadlift (50/30 KG), Hands Release Push Ups,
   DB Front Squats (12.5/5 KG) with scoring inline. Good accuracy fix from v1.

2. Round 2 description now reads 'Rowing 500 mtrs' — consistent with Stations table.
   The v1 contradiction (500 Cal vs 30 Cal) is resolved.

3. Round 3 panel still says 'Workout announced on competition day' but then lists
   ALL five exercises below it. Contradiction still present. Either remove the
   exercise list from this card or remove the 'announced on day' line.

4. Scoring values are embedded in the small w-detail text (Georgia 13px, opacity 0.78).
   Scoring is critical race-day data — make it visually distinct. Consider a
   small gold-coloured badge or bold style so it stands out from description text.

5. Round panel labels and gold-on-crimson hierarchy are visually strong and on-brand.
   The three-card layout communicates the progression clearly."""),

("STATIONS", """\
1. Round 1 now has a 6-column table with Scoring column added.
   All exercises correctly updated: Deadlift, Hands Release Push Ups,
   corrected DB Front Squats weights (12.5/5 KG). Accurate and complete.

2. Scoring values match the workout plan Excel for all Round 1 and Round 2 stations.
   This is now the most accurate and information-dense section on the site.

3. A 6-column table on mobile (<600px) will compress to near-unreadable widths.
   Test on a real phone. Consider hiding the Time column on mobile (always 2 Mins)
   to free up space, or switching to a card-per-row layout below 600px.

4. Sprint with Weights still shows Weight = dash with no load specified.
   The name implies additional weight. Specify the weight or rename the movement.

5. Round 2 Rowing target corrected to 500 Mtrs (M & F) with 1 mtr = 1 Pt scoring.
   Consistent with the Format section. Contradiction from v1 resolved."""),

("RULES", """\
1. Rule 04 still labelled ECO BIKE STANDARDS while every other section calls it
   ERG BIKE. One-word fix: rename to ERG BIKE STANDARDS.

2. Push-Up rule (card 02) still describes a regular push-up. The movement standard
   in Stations is now Hands Release Push Ups. Update rule 02 to include the
   hands-release requirement (hands must leave the floor at the bottom).

3. New v2 exercises (Deadlift, DB Front Squats, Sprint with Weights, Inch Worms)
   have no rule cards. Athletes have no published standards for 4 of 7 Round 1
   stations. Add at minimum a Deadlift lockout standard and DB Squat depth standard.

4. Rule card decorative numbers (01-06) are very faint at ~opacity 0.15.
   Raise to 0.22 for a visible but still subtle decorative element.

5. No Inch Worm movement standard. One of seven Round 1 stations has no
   official standard. Add a card: full hand walkout, chest to floor, walk back."""),

("VENUE", """\
1. Biggest improvement in v2. Real venue name, confirmed date, and map link.
   'Rajaram Bhiku Pathare Stadium' + '12 JULY 2026' replaces the TBA placeholder.
   This alone makes the site credible to athletes considering registration.

2. VIEW ON GOOGLE MAPS link works and opens the correct location. Good.
   Consider replacing the empty box with an actual embedded Google Maps iframe
   for a more finished look — the embed URL is free and requires no API key.

3. Venue address uses Cinzel font in mixed case ('Rajaram Bhiku Pathare Stadium')
   while all other section content uses uppercase. Consistent capitalisation
   across the site will look more polished.

4. Date meta box shows 12 JULY 2026 in Bebas Neue — clear and bold. Good.
   Consider adding a Time meta box (e.g. 7:00 AM onwards) once confirmed.

5. Footer still shows Venue in quick-links instead of Season 1 to match the nav.
   Update the footer anchor text for consistency."""),

("REGISTRATION", """\
1. Registration price still shows Rs TBA. No change needed until pricing is set.
   This section should be first updated once fees are confirmed — it is the
   primary conversion blocker on the entire site right now.

2. Register Now button is active and links to register/index.html.
   Registration opens soon copy below it directly contradicts the live button.
   Fix one or the other: remove the opens soon line if registration is open,
   or disable the button with a greyed style if it is not yet open.

3. Both pricing cards are visually identical. The featured card style (crimson
   background) is defined in CSS but not applied to either card in HTML.
   Apply it to one card to create visual hierarchy.

4. Early bird pricing available has no deadline date on either card.
   An urgency-free early-bird offer has no persuasive effect. Add a date
   once pricing is confirmed: Early bird until 15 June 2026.

5. Scar overlay behind the registration section adds a nice brand touch
   without cluttering the content. Keep this visual treatment."""),

("FAQ", """\
1. No changes from v1. The Round 3 spoiler contradiction still present:
   one FAQ answer lists all finals exercises while Format says announced on day.
   Align these two sections before publishing.

2. No FAQ about registration fees, refund, or cancellation policy.
   These are the top three questions athletes ask before paying.
   Add at minimum: What is the registration fee? Answer: Pricing TBA.

3. No FAQ covering on-the-day schedule or wave timing for Round 1.
   4 athletes at a time over 2h40m is buried in the Format description.
   Surface it here: How long does Round 1 take?

4. Scoring FAQ answer does not reflect v2 exercise updates. Deadlift
   (10 pts/rep) is new and not mentioned. Update to match the Stations table.

5. FAQ uses max-height:400px for open/close animation. Verify longest answer
   is not clipped when expanded, especially on mobile screens."""),

("CONTACT", """\
1. No changes from v1. Instagram and email links still unverified.
   With event date confirmed as 12 July, social presence should be live now.
   Create @rannbhoomi Instagram and confirm hello@rannbhoomi.com before
   any promotion or sharing of the site link.

2. WhatsApp float button added to the site (hero bottom-right corner) but the
   Contact section has no WhatsApp card. If WhatsApp is a primary support channel
   add it as a fourth contact card here for consistency.

3. Location contact card still shows Pune, Maharashtra / India as plain text.
   Update to show the real venue address and link to Google Maps, consistent
   with what the Venue section now shows.

4. Contact section tagline repeats the warrior-arena concept for the third time
   alongside Hero and Footer. Consider a more practical line here instead:
   Questions about registration or movement standards? Reach out directly.

5. No contact route for press, media, or gym partnerships listed.
   A short Partnerships email or note would be worth adding for B2B interest."""),

("FOOTER", """\
1. Footer renders cleanly on crimson background with gold logo and text.
   Good visual consistency with the updated crimson nav.

2. Footer quick-links show Venue instead of Season 1. Update to match the
   nav rename — a small but noticeable inconsistency for users who scroll.

3. Footer tagline reads The Arena Within — The Real Battle Is Inside You.
   The hero tagline was updated but the footer still has the old line.
   Decide on one consistent sub-brand line used across all touch-points.

4. Register and Leaderboard are absent from footer quick-links despite being
   the two highest-value destinations. Add both for users who scroll to the bottom.

5. Logo opacity is 0.6 — slightly dim on crimson background. Raise to 0.75
   for a crisper brand mark. Consistent with the gold logo used in the nav."""),

]

# ── XML helpers ───────────────────────────────────────────────────────────────
def xesc(s):
    return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

n = len(SECTIONS)

# ── Read existing file, find next free rId, extend sharedStrings ──────────────
with zipfile.ZipFile(XLSX, 'r') as z:
    existing = {name: z.read(name) for name in z.namelist()}

# Find highest rId in workbook.xml.rels
wb_rels_text = existing['xl/_rels/workbook.xml.rels'].decode()
used_ids = [int(m) for m in re.findall(r'Id="rId(\d+)"', wb_rels_text)]
next_rid = max(used_ids) + 1  # first free rId
sheet2_rid = f"rId{next_rid}"
print(f"Using {sheet2_rid} for sheet2 relationship")

# Read existing sharedStrings and find current count
ss_text = existing['xl/sharedStrings.xml'].decode()
existing_count = int(re.search(r'uniqueCount="(\d+)"', ss_text).group(1))
print(f"Existing shared strings: {existing_count}")

# Build new shared string entries for v2
# Indices: existing_count+0 = "Version 2 headers" label
# We need: 4 header strings + 2 per section (name + remarks) = 4 + 22 = 26 new strings
new_strings = [
    "Section",
    "Screenshot / Visual",
    "Remarks by Claude — Version 2",
    "Remarks by User",
]
for name, remarks in SECTIONS:
    new_strings.append(name)
    new_strings.append(remarks)

# String index map: name -> index in full shared strings table
def si(local_idx):
    return existing_count + local_idx  # offset by existing count

# Append new strings to sharedStrings.xml
new_si_xml = "\n".join(
    f'<si><t xml:space="preserve">{xesc(s)}</t></si>' for s in new_strings
)
new_total = existing_count + len(new_strings)
# Update count attribute and insert before </sst>
ss_updated = re.sub(
    r'count="\d+" uniqueCount="\d+"',
    f'count="{new_total}" uniqueCount="{new_total}"',
    ss_text
)
ss_updated = ss_updated.replace('</sst>', new_si_xml + '\n</sst>')

# ── Build sheet2.xml using shared strings (t="s") ────────────────────────────
def make_sheet2():
    rows = []
    # Header row
    rows.append(
        '<row r="1" ht="28" customHeight="1">'
        f'<c r="A1" t="s" s="1"><v>{si(0)}</v></c>'
        f'<c r="B1" t="s" s="1"><v>{si(1)}</v></c>'
        f'<c r="C1" t="s" s="1"><v>{si(2)}</v></c>'
        f'<c r="D1" t="s" s="1"><v>{si(3)}</v></c>'
        '</row>'
    )
    for i, img in enumerate(images):
        r = i + 2
        name_idx = si(4 + i * 2)
        rem_idx  = si(5 + i * 2)
        rows.append(
            f'<row r="{r}" ht="{img["ht"]}" customHeight="1">'
            f'<c r="A{r}" t="s" s="2"><v>{name_idx}</v></c>'
            f'<c r="B{r}" s="5"/>'
            f'<c r="C{r}" t="s" s="3"><v>{rem_idx}</v></c>'
            f'<c r="D{r}" s="4"/>'
            f'</row>'
        )
    return f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:D{n+1}"/>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="22"  customWidth="1"/>
    <col min="2" max="2" width="50"  customWidth="1"/>
    <col min="3" max="3" width="72"  customWidth="1"/>
    <col min="4" max="4" width="52"  customWidth="1"/>
  </cols>
  <sheetData>{''.join(rows)}</sheetData>
  <drawing r:id="rId1"/>
</worksheet>"""

def make_sheet2_rels():
    return """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/>
</Relationships>"""

def make_drawing2():
    def anchor(row0, pic_id, rid, cx, cy):
        return f"""\
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>1</xdr:col><xdr:colOff>40000</xdr:colOff>
      <xdr:row>{row0}</xdr:row><xdr:rowOff>40000</xdr:rowOff></xdr:from>
    <xdr:ext cx="{cx}" cy="{cy}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="{pic_id}" name="V2_{pic_id}"/>
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
    anchors = "\n".join(anchor(i+1, i+100, f"rId{i+1}", images[i]['cx'], images[i]['cy']) for i in range(n))
    return f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
{anchors}
</xdr:wsDr>"""

def make_drawing2_rels():
    items = "\n".join(
        f'  <Relationship Id="rId{i+1}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        f'Target="../media/v2_{i:02d}.png"/>'
        for i in range(n)
    )
    return f"""\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{items}
</Relationships>"""

# ── Patch content types, workbook.xml, workbook.xml.rels ─────────────────────
def patch_content_types(data):
    text = data.decode('utf-8')
    if '/xl/worksheets/sheet2.xml' in text:
        return text  # already patched
    insert = (
        '<Override PartName="/xl/worksheets/sheet2.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/drawings/drawing2.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    )
    return text.replace('</Types>', insert + '</Types>')

def patch_workbook(data):
    text = data.decode('utf-8')
    if 'Version 2' in text:
        # Already has Version 2 — update the rId to the correct one
        text = re.sub(r'<sheet name="Version 2"[^/]*/>',
                      f'<sheet name="Version 2" sheetId="2" r:id="{sheet2_rid}"/>',
                      text)
        return text
    return text.replace('</sheets>',
        f'<sheet name="Version 2" sheetId="2" r:id="{sheet2_rid}"/></sheets>')

def patch_workbook_rels(data):
    text = data.decode('utf-8')
    # Remove any existing sheet2 relationship (may have wrong rId)
    text = re.sub(
        r'\s*<Relationship[^>]*Target="worksheets/sheet2\.xml"[^/]*/>', '', text)
    # Add with correct rId
    new_rel = (
        f'\n  <Relationship Id="{sheet2_rid}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet2.xml"/>'
    )
    return text.replace('</Relationships>', new_rel + '\n</Relationships>')

# ── Write new xlsx ────────────────────────────────────────────────────────────
tmp = XLSX + ".tmp"
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as dst:
    for name, data in existing.items():
        if name == '[Content_Types].xml':
            dst.writestr(name, patch_content_types(data))
        elif name == 'xl/workbook.xml':
            dst.writestr(name, patch_workbook(data))
        elif name == 'xl/_rels/workbook.xml.rels':
            dst.writestr(name, patch_workbook_rels(data))
        elif name == 'xl/sharedStrings.xml':
            dst.writestr(name, ss_updated)
        else:
            dst.writestr(name, data)

    # New files
    dst.writestr('xl/worksheets/sheet2.xml',            make_sheet2())
    dst.writestr('xl/worksheets/_rels/sheet2.xml.rels', make_sheet2_rels())
    dst.writestr('xl/drawings/drawing2.xml',            make_drawing2())
    dst.writestr('xl/drawings/_rels/drawing2.xml.rels', make_drawing2_rels())
    for i, img in enumerate(images):
        dst.writestr(f'xl/media/v2_{i:02d}.png', img['data'])

shutil.move(tmp, OUT)
print(f"Done  : {OUT}")
print(f"Size  : {os.path.getsize(OUT):,} bytes")
print(f"Sheets: Website Review + Version 2 ({n} rows, {n} screenshots)")
print(f"Shared strings: {existing_count} existing + {len(new_strings)} new = {new_total} total")
