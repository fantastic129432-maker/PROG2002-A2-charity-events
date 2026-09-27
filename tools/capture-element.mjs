/**
 * capture-element.mjs
 * ---------------------------------------------------------------------------
 * Screenshots a single element (by CSS selector) in a given theme and language.
 * Used to check a reported defect in isolation instead of guessing which part of
 * a full-page screenshot it landed in.
 *
 * Usage:
 *   node tools/capture-element.mjs --url http://127.0.0.1:5500/index.html \
 *     --selector "#site-footer" --theme dark --lang zh --out .shots/footer.png
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
const selector = value('selector', '#site-footer');
const theme = value('theme', 'light');
const language = value('lang', 'en');
const out = value('out', '.shots/element.png');
const pad = Number(value('pad', 16));

const PORT = 9600 + (process.pid % 70);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!EDGE) {
  console.error('Edge not found');
  process.exit(1);
}

const profile = path.join(os.tmpdir(), `dsh-element-${Date.now()}`);
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

  // Scroll the element into view, then WAIT, then measure. Measuring in the
  // same expression as the scroll returned pre-scroll coordinates, which is why
  // an earlier capture came back as an empty strip.
  await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      return true;
    })()`,
  });
  await sleep(900);

  const box = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });
    })()`,
  });

  if (!box.result.value) throw new Error(`selector not found: ${selector}`);
  const rect = JSON.parse(box.result.value);

  // The element has just been centred, so capturing the whole viewport shows it
  // in context with the surrounding page - which is what makes a contrast
  // problem obvious - and avoids clipping arithmetic that is easy to get wrong.
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(
    `${selector} in ${theme}/${language} -> ${out} ` +
      `(element ${Math.round(rect.width)}x${Math.round(rect.height)} at y=${Math.round(rect.y)})`
  );

  // Also report the computed colours of the reporter's concerns.
  const colours = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, color: s.color };
      };
      return JSON.stringify({
        footer: pick('#site-footer'),
        heading: pick('.site-footer h3'),
        paragraph: pick('.site-footer p'),
        link: pick('.site-footer a'),
        status: pick('.site-footer__status'),
      }, null, 2);
    })()`,
  });
  console.log(colours.result.value);

  close();
} catch (error) {
  console.error('Capture failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
