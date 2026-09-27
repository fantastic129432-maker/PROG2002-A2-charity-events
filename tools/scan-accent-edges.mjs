/**
 * scan-accent-edges.mjs
 * ---------------------------------------------------------------------------
 * Lists every element that currently paints a visible border or outline in a
 * warm (yellow / amber / orange) colour, with its position and size.
 *
 * Written to locate the "yellow line" on the home page. Guessing from a
 * screenshot is unreliable, and the focus ring turned out not to be the cause,
 * so the page is scanned instead.
 *
 * Usage: node tools/scan-accent-edges.mjs [url] [theme]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5500/index.html';
const theme = process.argv[3] || 'dark';
const PORT = 9900 + (process.pid % 40);

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-accent-${Date.now()}`);
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    '--window-size=1400,1000',
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

const SCAN = `(() => {
  const parse = (value) => {
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  /** Warm = red and green clearly above blue. */
  const isWarm = (c) => c && c.a > 0.05 && c.r > 120 && c.g > 70 && c.r - c.b > 60 && c.g - c.b > 20;

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const sides = [];
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(s['border' + side + 'Width']);
      const colour = parse(s['border' + side + 'Color']);
      const style = s['border' + side + 'Style'];
      if (width > 0 && style !== 'none' && isWarm(colour)) {
        sides.push(side + ' ' + width + 'px ' + s['border' + side + 'Color']);
      }
    }

    const outlineWidth = parseFloat(s.outlineWidth);
    const outlineColour = parse(s.outlineColor);
    if (outlineWidth > 0 && s.outlineStyle !== 'none' && isWarm(outlineColour)) {
      sides.push('outline ' + outlineWidth + 'px ' + s.outlineColor);
    }

    if (sides.length === 0) continue;

    out.push({
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
        (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      edges: sides,
    });
  }
  return JSON.stringify({ count: out.length, items: out }, null, 2);
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
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('charity-events:theme', ${JSON.stringify(theme)});`,
  });

  await send('Page.navigate', { url });
  await sleep(4000);

  console.log(`warm borders and outlines in ${theme} theme on ${url}:`);
  console.log((await send('Runtime.evaluate', { expression: SCAN, returnByValue: true })).result.value);

  close();
} catch (error) {
  console.error('Scan failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
