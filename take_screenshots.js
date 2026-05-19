// Launches headless Chromium, opens the local website, and captures a
// cropped screenshot of each section. Writes PNGs to images/sections/.

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

const HTML_PATH = 'file://' + path.resolve(__dirname, 'rannbhoomi_website_1.html');
const OUT_DIR   = path.join(__dirname, 'images', 'sections');

// Map each section to the CSS selector and a short filename stem.
// For sections that span a lot of vertical space, padding is added
// so the crop includes enough context without being too tall.
const SECTIONS = [
  { id: 'nav',          sel: 'nav#navbar',      file: '00_nav'          },
  { id: 'hero',         sel: '#hero',            file: '01_hero'         },
  { id: 'about',        sel: '#about',           file: '02_about'        },
  { id: 'format',       sel: '#format',          file: '03_format'       },
  { id: 'stations',     sel: '#stations',        file: '04_stations'     },
  { id: 'rules',        sel: '#rules',           file: '05_rules'        },
  { id: 'venue',        sel: '#venue',           file: '06_venue'        },
  { id: 'registration', sel: '#registration',    file: '07_registration' },
  { id: 'faq',          sel: '#faq',             file: '08_faq'          },
  { id: 'contact',      sel: '#contact',         file: '09_contact'      },
  { id: 'footer',       sel: 'footer',           file: '10_footer'       },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('Loading page...');
  await page.goto(HTML_PATH, { waitUntil: 'networkidle0', timeout: 30000 });

  // Override all scroll-triggered reveal animations so everything is visible
  await page.addStyleTag({ content: `
    .reveal               { opacity: 1 !important; transform: none !important; transition: none !important; }
    .hero-content > *     { animation: none !important; opacity: 1 !important; transform: none !important; }
    .wordmark-wrap        { animation: none !important; opacity: 1 !important; transform: none !important; }
    .hero-eyebrow,
    .hero-tagline-block,
    .hero-pills,
    .hero-countdown,
    .hero-cta             { animation: none !important; opacity: 1 !important; }
    .hero-scroll          { animation: none !important; }
  ` });

  // Scroll through the page to trigger IntersectionObserver
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const total = document.body.scrollHeight;
      const id = setInterval(() => {
        window.scrollTo(0, y);
        y += 300;
        if (y >= total) { window.scrollTo(0, 0); clearInterval(id); resolve(); }
      }, 40);
    });
  });

  await new Promise(r => setTimeout(r, 800));

  for (const sec of SECTIONS) {
    try {
      const el = await page.$(sec.sel);
      if (!el) { console.warn(`  SKIP ${sec.id} — selector not found`); continue; }

      const box = await el.boundingBox();
      if (!box) { console.warn(`  SKIP ${sec.id} — no bounding box`); continue; }

      // Clip to the element bounds, capped at 1200px tall for very long sections
      const clip = {
        x:      Math.max(0, box.x),
        y:      Math.max(0, box.y),
        width:  box.width,
        height: Math.min(box.height, 1200),
      };

      const out = path.join(OUT_DIR, sec.file + '.png');
      await page.screenshot({ path: out, clip });
      console.log(`  OK  ${sec.file}.png  (${clip.width}x${clip.height})`);
    } catch (e) {
      console.warn(`  ERR ${sec.id}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots in:', OUT_DIR);
})();
