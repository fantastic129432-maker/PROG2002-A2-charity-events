/**
 * find-element-at.mjs
 * ---------------------------------------------------------------------------
 * Reports which element occupies a given point on the rendered page, and its
 * computed border, outline and background. Used to identify an unexplained line
 * or edge without guessing from a screenshot.
 *
 * Usage:
 *   node tools/find-element-at.mjs --url http://127.0.0.1:5500/index.html \
 *     --x 700 --y 480 --theme dark
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const url = value('url', 'http://127.0.0.1:5500/index.html');
const theme = value('theme', 'dark');
const language = value('lang', 'en');
const x = Number(value('x', 700));
const y = Number(value('y', 480));

const PORT = 9700 + (process.pid % 60);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-at-${Date.now()}`);
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

/**
 * Finds every element whose box edge (border or outline) passes through the
 * given point, plus who the point actually hits.
 */
const PROBE = (px, py) => `(() => {
  const describe = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: String(el.className || ''),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      borderTop: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
      borderBottom: s.borderBottomWidth + ' ' + s.borderBottomStyle + ' ' + s.borderBottomColor,
      outline: s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor,
      background: s.backgroundColor,
      backgroundImage: s.backgroundImage.slice(0, 80),
      boxShadow: s.boxShadow.slice(0, 80),
      accentColor: s.accentColor,
      focusVisible: el.matches(':focus-visible'),
      isActive: document.activeElement === el,
    };
  };

  const hits = [];
  const atPoint = document.elementsFromPoint(${px}, ${py});
  for (const el of atPoint.slice(0, 6)) hits.push(describe(el));

  // Anything with a coloured border or outline whose edge is near the point.
  const edges = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const coloured = (value) => value && !/rgba?\\(0, 0, 0, 0\\)/.test(value);
    const near = (edgeY) => Math.abs(edgeY - ${py}) <= 3;
    const nearX = ${px} >= r.left - 40 && ${px} <= r.right + 40;
    if (!nearX) continue;

    const interesting =
      (coloured(s.borderBottomColor) && parseFloat(s.borderBottomWidth) > 0 && near(r.bottom)) ||
      (coloured(s.borderTopColor) && parseFloat(s.borderTopWidth) > 0 && near(r.top)) ||
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0);
    if (interesting) edges.push(describe(el));
  }

  const root = getComputedStyle(document.documentElement);
  return JSON.stringify({
    atPoint: hits,
    edgesNearPoint: edges.slice(0, 8),
    rootAccent: root.accentColor,
    scrollY: Math.round(window.scrollY),
    documentHeight: document.documentElement.scrollHeight,
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
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('charity-events:theme', ${JSON.stringify(theme)});
             localStorage.setItem('charity-events:language', ${JSON.stringify(language)});`,
  });

  await send('Page.navigate', { url });
  await sleep(4000);

  const result = await send('Runtime.evaluate', {
    expression: PROBE(x, y),
    returnByValue: true,
  });
  console.log(result.result.value);

  close();
} catch (error) {
  console.error('Probe failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
