const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PITCH_DIR = __dirname;
const HTML_PATH = path.join(PITCH_DIR, 'index.html');
const PDF_PATH = path.join(PITCH_DIR, 'Opera_Protocol_Pitch_Deck.pdf');
const W = 1600;
const H = 900;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });

  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);

  // Match on-screen deck; kill motion so capture isn't mid-animation
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      .deck-nav { display: none !important; }
      .hero-wordmark, .hero-sub, .hero-pills {
        opacity: 1 !important;
        transform: none !important;
      }
    `,
  });

  const slideCount = await page.locator('.slide').count();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opera-pitch-'));
  const shotPaths = [];

  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((index) => {
      const slides = [...document.querySelectorAll('.slide')];
      const dots = [...document.querySelectorAll('.dot')];
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === index));
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === index));
    }, i);
    await page.waitForTimeout(80);
    const shotPath = path.join(tmpDir, `slide-${i + 1}.png`);
    await page.screenshot({ path: shotPath, type: 'png' });
    shotPaths.push(shotPath);
  }

  const pagesHtml = shotPaths
    .map(
      (p, i) =>
        `<section class="page${i === shotPaths.length - 1 ? ' last' : ''}"><img src="file://${p}" alt="Slide ${i + 1}" /></section>`,
    )
    .join('\n');

  const assemblePath = path.join(tmpDir, 'assemble.html');
  fs.writeFileSync(
    assemblePath,
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${W}px ${H}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page {
      width: ${W}px;
      height: ${H}px;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .page.last {
      page-break-after: auto;
      break-after: auto;
    }
    img {
      width: ${W}px;
      height: ${H}px;
      display: block;
      border: 0;
    }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`,
  );

  const printPage = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await printPage.goto(`file://${assemblePath}`, { waitUntil: 'load' });
  await printPage.pdf({
    path: PDF_PATH,
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });

  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`PDF saved to ${PDF_PATH} (${slideCount} slides)`);
})();
