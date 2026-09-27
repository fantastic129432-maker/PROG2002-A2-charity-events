/**
 * probe-caret.mjs
 * ---------------------------------------------------------------------------
 * Answers one question in a real browser: if the user clicks the text of a
 * content section, does the browser put a text insertion caret there?
 *
 * A caret appears when the clicked element is focusable. The original defect was
 * caused by the section jump adding tabindex="-1" to the target, which made its
 * paragraphs behave like text inputs.
 *
 * The probe also supports --inject-tabindex, which reproduces the old behaviour
 * so the measurement can be shown to detect the defect rather than always
 * reporting "fine".
 *
 * Usage:
 *   node tools/probe-caret.mjs                       expect: no caret
 *   node tools/probe-caret.mjs --inject-tabindex     reproduce the old defect
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inject = process.argv.includes('--inject-tabindex');
const url = 'http://127.0.0.1:5500/index.html#contact';
const PORT = 9300 + (process.pid % 50);

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-caret-${Date.now()}`);
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

  if (inject) {
    // Reproduce the old behaviour: make the section jump focusable again.
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('contact');
        if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
      });`,
    });
  }

  await send('Page.navigate', { url });
  await sleep(3500);

  // Click the middle of a paragraph inside the section, as a visitor would.
  const box = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const p = document.querySelector('#contact .info-card p');
      if (!p) return null;
      p.scrollIntoView({ block: 'center' });
      const r = p.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    })()`,
  });
  if (!box.result.value) throw new Error('no paragraph found inside #contact');
  const point = JSON.parse(box.result.value);
  await sleep(400);

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(500);

  const state = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const active = document.activeElement;
      const section = document.getElementById('contact');
      const describe = (el) => el
        ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '')
        : 'null';
      const s = section ? getComputedStyle(section) : null;
      return JSON.stringify({
        activeElement: describe(active),
        activeIsInsideSection: section ? section.contains(active) : false,
        sectionTabindex: section ? section.getAttribute('tabindex') : null,
        sectionOutline: s ? s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor : null,
        focusableContentCount: document.querySelectorAll('section[tabindex], div[tabindex], p[tabindex]').length,
      }, null, 2);
    })()`,
  });

  console.log(`mode: ${inject ? 'REPRODUCING the old defect (tabindex injected)' : 'current code'}`);
  console.log(state.result.value);

  const report = JSON.parse(state.result.value);
  const caretRisk = report.activeIsInsideSection || report.sectionTabindex !== null;
  console.log(
    caretRisk
      ? '\nRESULT: the section is focusable, so clicking its text shows an insertion caret.'
      : '\nRESULT: nothing in the section is focusable, so no caret can appear.'
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
