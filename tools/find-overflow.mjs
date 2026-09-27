/**
 * find-overflow.mjs
 * ---------------------------------------------------------------------------
 * Answers one question precisely: "which element is wider than the viewport?"
 *
 * It starts Microsoft Edge headless with the DevTools protocol enabled, opens a
 * page, and evaluates a small script that walks the DOM looking for elements
 * whose right edge or scrollWidth exceeds the viewport width. Guessing from a
 * screenshot is unreliable; this reports the exact selectors.
 *
 * Usage:
 *   node tools/find-overflow.mjs http://127.0.0.1:5500/search.html 420
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5500/search.html';
const width = Number(process.argv[3] || 420);
const height = Number(process.argv[4] || 900);
const PORT = 9222;

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const browser = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('No Chromium browser found. Checked:\n  ' + EDGE_CANDIDATES.join('\n  '));
  process.exit(1);
}

const profile = path.join(os.tmpdir(), `dsh-overflow-${Date.now()}`);
const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll the DevTools HTTP endpoint until it answers. */
async function waitForDevTools() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint did not start');
}

/** Minimal CDP client over the page WebSocket. */
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

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { send, close: () => socket.close() };
}

function describe(element) {
  const id = element.id ? `#${element.id}` : '';
  const classes = element.classList.length
    ? '.' + [...element.classList].slice(0, 3).join('.')
    : '';
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const element of document.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const overflowX = element.scrollWidth - element.clientWidth;
    const pastRight = Math.round(rect.right) > vw;
    if (pastRight || overflowX > 1) {
      offenders.push({
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        classes: [...element.classList].join(' '),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX
      });
    }
  }
  return JSON.stringify({
    viewportWidth: vw,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 25)
  }, null, 2);
})()`;

try {
  await waitForDevTools();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  ).json();

  const { send, close } = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');

  // A real viewport override is used instead of relying on --window-size:
  // Chromium enforces a minimum window width on Windows, so asking for 420
  // silently produced a 477px viewport and made the screenshot misleading.
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });

  await send('Page.navigate', { url });
  await sleep(3500); // let the API calls and rendering settle

  const result = await send('Runtime.evaluate', {
    expression: OVERFLOW_PROBE,
    returnByValue: true,
  });

  const data = JSON.parse(result.result.value);
  console.log(`URL              : ${url}`);
  console.log(`Viewport width   : ${data.viewportWidth}`);
  console.log(`Document scroll  : ${data.documentScrollWidth}`);
  console.log(`Body scroll      : ${data.bodyScrollWidth}`);
  console.log(
    data.documentScrollWidth > data.viewportWidth
      ? `\nHORIZONTAL OVERFLOW of ${data.documentScrollWidth - data.viewportWidth}px\n`
      : '\nNo horizontal overflow.\n'
  );

  if (data.offenders.length) {
    console.log('Elements whose right edge passes the viewport, or that scroll internally:');
    for (const item of data.offenders) {
      const selector = `${item.tag}${item.id ? '#' + item.id : ''}${
        item.classes ? '.' + item.classes.split(' ').slice(0, 3).join('.') : ''
      }`;
      console.log(
        `  ${selector.padEnd(46)} right=${String(item.right).padStart(5)} ` +
          `width=${String(item.width).padStart(5)} scrollW=${String(item.scrollWidth).padStart(5)} ` +
          `clientW=${String(item.clientWidth).padStart(5)}`
      );
    }
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
