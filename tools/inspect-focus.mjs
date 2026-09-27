/**
 * inspect-focus.mjs
 * ---------------------------------------------------------------------------
 * Reports which element holds focus after a fresh load, and after a real
 * reload, together with its computed outline.
 *
 * Written to explain the amber line that appeared on the home page: the design
 * uses an amber :focus-visible outline, and a browser restores focus to the
 * element that was focused before a reload - so a "line" is really the focus
 * ring on whatever was last clicked.
 *
 * Usage: node tools/inspect-focus.mjs [url]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5500/index.html';
const PORT = 9800 + (process.pid % 50);

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-focus-${Date.now()}`);
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

const REPORT = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) {
    return JSON.stringify({ activeElement: 'body (nothing focused)', outline: null }, null, 2);
  }
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return JSON.stringify({
    activeElement: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.className ? '.' + String(el.className).split(' ')[0] : ''),
    text: (el.textContent || '').trim().slice(0, 40),
    focusVisible: el.matches(':focus-visible'),
    outlineWidth: s.outlineWidth,
    outlineStyle: s.outlineStyle,
    outlineColor: s.outlineColor,
    outlineOffset: s.outlineOffset,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('charity-events:theme', 'dark');`,
  });

  await send('Page.navigate', { url });
  await sleep(3500);
  console.log('=== fresh load ===');
  console.log((await send('Runtime.evaluate', { expression: REPORT, returnByValue: true })).result.value);

  // Focus a control the way a click would, then reload: this is the sequence
  // that produced the amber line.
  await send('Runtime.evaluate', {
    expression: `document.getElementById('theme-toggle').focus();`,
  });
  await sleep(300);
  console.log('\n=== after focusing #theme-toggle (as a click does) ===');
  console.log((await send('Runtime.evaluate', { expression: REPORT, returnByValue: true })).result.value);

  await send('Page.reload');
  await sleep(3500);
  console.log('\n=== after Page.reload (focus restoration) ===');
  console.log((await send('Runtime.evaluate', { expression: REPORT, returnByValue: true })).result.value);

  close();
} catch (error) {
  console.error('Probe failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
