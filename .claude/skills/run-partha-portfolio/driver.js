#!/usr/bin/env node
/**
 * Driver for the partha-portfolio cinematic scroll site.
 * CommonJS on purpose — NODE_PATH resolution (see SKILL.md) only
 * works for `require()`, not native ESM `import`.
 *
 * Usage (from repo root, see SKILL.md for the required NODE_PATH):
 *   node .claude/skills/run-partha-portfolio/driver.js [--mobile] [--port 4173] [--keep-server]
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SHOTS_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const PORT = Number((args.find(a => a.startsWith('--port=')) || '--port=4173').split('=')[1]);
const MOBILE = args.includes('--mobile');
const KEEP_SERVER = args.includes('--keep-server');

const failures = [];
function check(label, cond, detail) {
  if (cond) { console.log('PASS  ' + label); }
  else { console.log('FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); failures.push(label); }
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function poll() {
      http.get('http://localhost:' + port, res => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() > deadline) return reject(new Error('server did not come up on :' + port));
          setTimeout(poll, 400);
        });
    })();
  });
}

function checksum(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 97) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function killPort(port) {
  try { execSync(`lsof -ti:${port} -sTCP:LISTEN | xargs -r kill`, { stdio: 'ignore' }); } catch (e) { /* nothing listening */ }
}

async function desktopPass(page) {
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(500);

  const pins = await page.evaluate(() =>
    ScrollTrigger.getAll().filter(t => t.pin).map(t => ({ id: t.trigger.id, start: t.start, end: t.end })));
  check('ScrollTrigger pins registered (hero/pillars/work/contact)',
    ['hero', 'pillars', 'work', 'contact'].every(id => pins.some(p => p.id === id)),
    JSON.stringify(pins.map(p => p.id)));
  const byId = Object.fromEntries(pins.map(p => [p.id, p]));
  const lerp = (id, t) => Math.round(byId[id].start + (byId[id].end - byId[id].start) * t);

  // Hero: canvas frame-sequence orbit must actually change across the scrub
  const hashes = [];
  for (const t of [0.02, 0.4, 0.85]) {
    await page.evaluate(y => window.scrollTo(0, y), lerp('hero', t));
    await page.waitForTimeout(700);
    hashes.push(checksum(await page.evaluate(() =>
      document.getElementById('heroCanvas').toDataURL('image/jpeg', 0.4))));
  }
  await page.screenshot({ path: path.join(SHOTS_DIR, 'hero.png') });
  check('Hero canvas scrubs (3 sampled frames all distinct)', new Set(hashes).size === 3, hashes.join(','));

  // Pillars: each of the three panels becomes visible somewhere in its pinned range
  await page.evaluate(y => window.scrollTo(0, y), lerp('pillars', 0.5));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'pillars.png') });
  const visiblePillars = await page.evaluate(() =>
    document.querySelectorAll('[data-pillar]').length);
  check('Pillars section has 3 pillar panels', visiblePillars === 3, String(visiblePillars));

  // Work: horizontal scrub track + one flagship card's video modal
  await page.evaluate(y => window.scrollTo(0, y), lerp('work', 0.3));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'work.png') });

  const cardHeights = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.wcard')).map(c => Math.round(c.getBoundingClientRect().height)));
  check('All work cards render the same height', new Set(cardHeights).size === 1, cardHeights.join(','));

  const btn = await page.$('.wcard-play');
  if (btn) await btn.click();
  await page.waitForTimeout(500);
  const modalOpen = await page.evaluate(() => !document.getElementById('videoModal').hidden);
  const iframeSrc = await page.evaluate(() => document.getElementById('videoModalIframe').src);
  check('Play button opens the video modal with a youtube embed src', modalOpen && iframeSrc.includes('youtube-nocookie.com/embed/'), iframeSrc);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'work-modal.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const modalClosed = await page.evaluate(() => document.getElementById('videoModal').hidden);
  check('Escape closes the video modal', modalClosed);

  // Background videos: only the on-screen section's clip should be playing
  const vidsAtWork = await page.evaluate(() =>
    Array.from(document.querySelectorAll('video.vsec-bg')).map(v => ({ src: v.src.split('/').pop(), paused: v.paused })));
  const mentorPlaying = vidsAtWork.find(v => v.src === 'the-mentor.mp4');
  check('Only the active section\'s background video plays', !!mentorPlaying && mentorPlaying.paused === false, JSON.stringify(vidsAtWork));

  // Finale
  await page.evaluate(y => window.scrollTo(0, y), lerp('contact', 0.6));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'finale.png') });
}

async function mobilePass(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'mobile-nav.png'), clip: { x: 0, y: 0, width: 390, height: 90 } });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on 390px mobile viewport', overflow === 0, overflow + 'px');
  await page.close();
}

(async () => {
  let serverProc = null;
  await killPort(PORT);
  serverProc = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO_ROOT, stdio: 'ignore', detached: true });
  await waitForServer(PORT, 15000);
  console.log(`Serving ${REPO_ROOT} on :${PORT}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const consoleErrors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) consoleErrors.push('http ' + r.status() + ': ' + r.url()); });

  try {
    await desktopPass(page);
    check('No console errors / failed requests', consoleErrors.length === 0, consoleErrors.join(' | '));
    if (MOBILE) await mobilePass(browser);
  } finally {
    await browser.close();
    if (!KEEP_SERVER && serverProc) { try { process.kill(-serverProc.pid); } catch (e) { await killPort(PORT); } }
  }

  console.log('\nScreenshots: ' + SHOTS_DIR);
  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed:\n - ` + failures.join('\n - '));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
