/**
 * probe-nav-state.mjs
 * ---------------------------------------------------------------------------
 * Reports the real rendered navigation state for a given URL, using a real
 * Chromium browser rather than jsdom.
 *
 * It answers the two questions from the bug report:
 *   1. which menu entry is highlighted (exactly one, and the right one), and
 *   2. whether the section in the URL is actually scrolled into view.
 *
 * Usage:
 *   node tools/probe-nav-state.mjs "http://127.0.0.1:5500/index.html#about"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5500/index.html';
const PORT = 9344 + (process.pid % 60);

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!EDGE) {
  console.error('Edge not found');
  process.exit(1);
}

const profile = path.join(os.tmpdir(), `dsh-nav-${Date.now()}`);
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    '--window-size=1400,900',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevTools() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error('DevTools did not start');
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
    close: () => socket.close(),
  };
}

const PROBE = `(() => {
  const active = [...document.querySelectorAll('#site-header .site-nav__link--active')]
    .map((link) => ({
      label: link.textContent.trim(),
      href: link.getAttribute('href'),
      ariaCurrent: link.getAttribute('aria-current')
    }));

  const menu = [...document.querySelectorAll('#site-header .site-nav__link')]
    .map((link) => link.textContent.trim() + ' -> ' + link.getAttribute('href'));

  const hash = window.location.hash;
  let target = null;
  if (hash.length > 1) {
    const element = document.querySelector(hash);
    if (element) {
      const rect = element.getBoundingClientRect();
      target = {
        id: element.id,
        topInViewport: Math.round(rect.top),
        documentTop: Math.round(rect.top + window.scrollY),
        hasFocus: document.activeElement === element
      };
    } else {
      target = { id: hash.slice(1), found: false };
    }
  }

  return JSON.stringify({
    url: window.location.href,
    hash: hash,
    scrollY: Math.round(window.scrollY),
    activeEntries: active,
    menu: menu,
    sectionTarget: target
  }, null, 2);
})()`;

try {
  await waitForDevTools();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json();

  const { send, close } = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(1500);

  // Wait for the section named in the URL to actually land in the viewport.
  // Smooth scrolling is animated and the page also grows as event images load,
  // so polling for the outcome is more meaningful than sampling once.
  const settled = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const hash = window.location.hash;
      const started = Date.now();
      let best = null;
      const timer = setInterval(() => {
        const element = hash.length > 1 ? document.querySelector(hash) : null;
        if (element) {
          const top = Math.round(element.getBoundingClientRect().top);
          if (best === null || Math.abs(top) < Math.abs(best)) best = top;
          if (Math.abs(top) < 120) {
            clearInterval(timer);
            resolve({ inView: true, top, scrollY: Math.round(window.scrollY), ms: Date.now() - started });
            return;
          }
        }
        if (Date.now() - started > 8000) {
          clearInterval(timer);
          resolve({ inView: false, top: best, scrollY: Math.round(window.scrollY), ms: Date.now() - started });
        }
      }, 100);
    })`,
  });

  const result = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const data = JSON.parse(result.result.value);
  data.settleResult = settled.result.value;

  console.log('URL               :', data.url);
  console.log('Fragment          :', data.hash || '(none)');
  console.log('scrollY           :', data.scrollY);
  console.log('Section reached   :', JSON.stringify(data.settleResult));
  console.log('\nMenu entries:');
  for (const entry of data.menu) console.log('  ' + entry);
  console.log('\nHighlighted:');
  if (data.activeEntries.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of data.activeEntries) {
      console.log(`  ${entry.label}  href=${entry.href}  aria-current=${entry.ariaCurrent}`);
    }
  }
  console.log(`\nHighlighted count : ${data.activeEntries.length}`);
  if (data.sectionTarget) {
    console.log('Section target    :', JSON.stringify(data.sectionTarget));
    console.log(
      'In view?          :',
      data.sectionTarget.found === false
        ? 'the element does not exist'
        : Math.abs(data.sectionTarget.topInViewport) < 120
          ? 'yes'
          : 'no'
    );
  }

  close();
} catch (error) {
  console.error('Probe failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
