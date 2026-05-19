const puppeteer = require('puppeteer');
const path      = require('path');

const HTML = 'file://' + path.resolve(__dirname, 'rannbhoomi_website_1.html');
const OUT  = path.join(__dirname, 'images', 'Rannbhoomi_Fullpage.png');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  console.log('Loading page...');
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 30000 });

  // Force all reveal/animation states to their final visible form
  await page.addStyleTag({ content: `
    .reveal               { opacity: 1 !important; transform: none !important; transition: none !important; }
    [class*="fadeUp"]     { opacity: 1 !important; transform: none !important; animation: none !important; }
    .hero-content > *     { animation: none !important; opacity: 1 !important; transform: none !important; }
    .wordmark-wrap        { animation: none !important; opacity: 1 !important; transform: none !important; }
    .hero-eyebrow,
    .hero-tagline-block,
    .hero-pills,
    .hero-countdown,
    .hero-cta             { animation: none !important; opacity: 1 !important; }
    .hero-scroll          { animation: none !important; }
  ` });

  // Scroll through the full page to trigger IntersectionObserver
  await page.evaluate(async () => {
    await new Promise(resolve => {
      const step = 300;
      let y = 0;
      const total = document.body.scrollHeight;
      const id = setInterval(() => {
        window.scrollTo(0, y);
        y += step;
        if (y >= total) { window.scrollTo(0, 0); clearInterval(id); resolve(); }
      }, 40);
    });
  });

  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  console.log('Saved:', OUT);
})();
