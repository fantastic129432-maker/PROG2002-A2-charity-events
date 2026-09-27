/**
 * compare-caret-on-text.mjs
 * ---------------------------------------------------------------------------
 * Control experiment: click a heading on this project's page and on a page that
 * has no CSS of ours at all, and report whether a caret appears in both cases.
 *
 * If the caret appears on the neutral page too, it is default browser behaviour
 * for clicking text rather than something this project does.
 *
 * Usage: node tools/compare-caret-on-text.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9150 + (process.pid % 50);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-compare-${Date.now()}`);
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    '--window-size=1200,800',
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

/** Click a point and report the resulting selection. */
async function clickAndReport(send, selector, url) {
  await send('Page.navigate', { url });
  await sleep(url.startsWith('data:') ? 700 : 3500);

  const box = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    })()`,
  });
  if (!box.result.value) return { error: `no element for ${selector}` };

  const point = JSON.parse(box.result.value);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(400);

  const state = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const sel = window.getSelection();
      return JSON.stringify({
        selectionType: sel ? sel.type : 'none',
        collapsed: sel ? sel.isCollapsed : null,
        caretInText: sel && sel.type === 'Caret' && sel.isCollapsed ? 'yes' : 'no',
        activeElement: document.activeElement.tagName.toLowerCase(),
      });
    })()`,
  });
  return JSON.parse(state.result.value);
}

const NEUTRAL_PAGE =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<!doctype html><html><head><title>neutral</title></head><body>' +
      '<h1 id="t" style="font-family:Arial;font-size:42px;margin:60px">Plain heading with no CSS of ours</h1>' +
      '<p style="font-family:Arial;margin:60px">A plain paragraph.</p>' +
      '</body></html>'
  );

try {
  await waitForDevTools();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const { send, close } = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('--- neutral page, no stylesheet of ours ---');
  console.log(JSON.stringify(await clickAndReport(send, '#t', NEUTRAL_PAGE), null, 2));

  console.log('\n--- this project, hero heading ---');
  console.log(
    JSON.stringify(
      await clickAndReport(send, '#hero-heading', 'http://127.0.0.1:5500/index.html'),
      null,
      2
    )
  );

  console.log('\n--- this project, a paragraph in the contact card ---');
  console.log(
    JSON.stringify(
      await clickAndReport(send, '#contact .info-card p', 'http://127.0.0.1:5500/index.html'),
      null,
      2
    )
  );

  close();
} catch (error) {
  console.error('Comparison failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
