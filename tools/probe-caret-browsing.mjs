/**
 * probe-caret-browsing.mjs
 * ---------------------------------------------------------------------------
 * Shows where the vertical line comes from, by turning caret browsing on and off
 * through the DevTools protocol and clicking the same heading both times.
 *
 * Caret browsing is a browser accessibility mode (F7 in Edge and Chrome, Safari
 * has the same idea). It places a movable text cursor inside page text so it can
 * be read and selected with the keyboard - which is exactly the "vertical line in
 * the text" being reported, and it is a browser feature rather than page CSS.
 *
 * Usage: node tools/probe-caret-browsing.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9100 + (process.pid % 60);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!EDGE) {
  console.error('Edge not found');
  process.exit(1);
}

const profile = path.join(os.tmpdir(), `dsh-caretbrowse-${Date.now()}`);
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

/** Clicks the middle of the hero heading and reports what the click produced. */
async function clickHeadingAndReport(send) {
  const box = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const h = document.getElementById('hero-heading');
      h.scrollIntoView({ block: 'center' });
      const r = h.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width * 0.35), y: Math.round(r.y + r.height * 0.3) });
    })()`,
  });
  const point = JSON.parse(box.result.value);
  await sleep(400);

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(400);

  const state = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const sel = window.getSelection();
      const heading = document.getElementById('hero-heading');
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      return JSON.stringify({
        selectionType: sel ? sel.type : 'none',
        selectionAnchorInsideHeading: range ? heading.contains(range.startContainer) : false,
        activeElement: document.activeElement.tagName.toLowerCase(),
        headingContainsCaret:
          range && heading.contains(range.startContainer) && sel.isCollapsed
            ? 'yes - a collapsed selection inside the heading is a text caret'
            : 'no',
      }, null, 2);
    })()`,
  });
  return JSON.parse(state.result.value);
}

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
  await send('Page.navigate', { url: 'http://127.0.0.1:5500/index.html' });
  await sleep(3800);

  /* ---- 1. caret browsing OFF (the default) -------------------------- */
  try {
    await send('Emulation.setCaretBrowsingEnabled', { enabled: false });
  } catch (error) {
    console.log(`(could not toggle caret browsing: ${error.message})`);
  }
  console.log('=== caret browsing OFF (browser default) ===');
  console.log(JSON.stringify(await clickHeadingAndReport(send), null, 2));

  /* ---- 2. caret browsing ON (what F7 enables) ---------------------- */
  await send('Emulation.setCaretBrowsingEnabled', { enabled: true });
  console.log('\n=== caret browsing ON (what F7 toggles) ===');
  console.log(JSON.stringify(await clickHeadingAndReport(send), null, 2));

  console.log(
    '\nA collapsed selection inside the heading is the vertical line: the browser\'s\n' +
      'text caret, which caret browsing places in any text you click.'
  );

  close();
} catch (error) {
  console.error('Probe failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
