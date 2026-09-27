/**
 * probe-settings.mjs
 * ---------------------------------------------------------------------------
 * Drives the language switcher and the theme switch in a real Chromium browser
 * and reports what actually happened: which language is applied, whether the
 * dark theme reaches the document, and whether the switch survives a reload.
 *
 * It can also capture a screenshot so the result can be checked visually.
 *
 * Usage:
 *   node tools/probe-settings.mjs --lang ja --theme dark --shot .shots/ja-dark.png
 *   node tools/probe-settings.mjs --lang zh
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ---- arguments ---------------------------------------------------- */
const args = process.argv.slice(2);
function argValue(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}

const url = argValue('url', 'http://127.0.0.1:5500/index.html');
const language = argValue('lang', null);
const theme = argValue('theme', null);
const shotPath = argValue('shot', null);
const width = Number(argValue('width', 1400));
const height = Number(argValue('height', 900));

const PORT = 9400 + (process.pid % 90);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

if (!EDGE) {
  console.error('Edge not found');
  process.exit(1);
}

const profile = path.join(os.tmpdir(), `dsh-settings-${Date.now()}`);
const child = spawn(
  EDGE,
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

/** Reads the settings state out of the live page. */
const REPORT = `(() => {
  const root = document.documentElement;
  const select = document.getElementById('language-select');
  const button = document.getElementById('theme-toggle');
  const pick = (selector) => {
    const el = document.querySelector(selector);
    return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
  };
  return JSON.stringify({
    htmlLang: root.getAttribute('lang'),
    theme: root.getAttribute('data-theme'),
    themePreference: root.getAttribute('data-theme-preference'),
    colorScheme: root.style.colorScheme,
    storedLanguage: localStorage.getItem('charity-events:language'),
    storedTheme: localStorage.getItem('charity-events:theme'),
    languageOptions: select ? [...select.options].map((o) => o.value) : null,
    languageValue: select ? select.value : null,
    themeButton: button ? button.textContent.replace(/\\s+/g, ' ').trim() : null,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    navHome: pick('.site-nav__link'),
    heroHeading: pick('#hero-heading'),
    eventsHeading: pick('#events-heading'),
    aboutHeading: pick('#about-heading'),
    submitButton: pick('#search-button'),
    note: pick('#settings-note'),
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
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Storage has to be primed before any page script runs, otherwise the page
  // would start in English and the test would only measure the switch.
  const primer = [
    language ? `localStorage.setItem('charity-events:language', ${JSON.stringify(language)});` : '',
    theme ? `localStorage.setItem('charity-events:theme', ${JSON.stringify(theme)});` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (primer) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: primer });
  }

  await send('Page.navigate', { url });
  await sleep(4000);

  const result = await send('Runtime.evaluate', { expression: REPORT, returnByValue: true });
  console.log('=== initial load ===');
  console.log(result.result.value);

  /* ---- switch language through the control ------------------------ */
  const switched = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const select = document.getElementById('language-select');
      if (!select) return 'no language switcher';
      const target = select.value === 'vi' ? 'zh' : 'vi';
      select.value = target;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1500));
      return document.querySelector('#events-heading').textContent.trim();
    })()`,
  });
  console.log('\n=== after switching language with the control ===');
  console.log(`events heading is now: ${JSON.stringify(switched.result.value)}`);

  /* ---- cycle the theme through the control ------------------------ */
  const cycled = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const button = document.getElementById('theme-toggle');
      if (!button) return 'no theme switch';
      button.click();
      await new Promise((r) => setTimeout(r, 400));
      const root = document.documentElement;
      return JSON.stringify({
        theme: root.getAttribute('data-theme'),
        preference: root.getAttribute('data-theme-preference'),
        stored: localStorage.getItem('charity-events:theme'),
        buttonText: button.textContent.replace(/\\s+/g, ' ').trim(),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      });
    })()`,
  });
  console.log('\n=== after clicking the theme switch ===');
  console.log(cycled.result.value);

  /* ---- reload to confirm both choices persist --------------------- */
  await send('Page.navigate', { url });
  await sleep(3500);
  const afterReload = await send('Runtime.evaluate', { expression: REPORT, returnByValue: true });
  const reloaded = JSON.parse(afterReload.result.value);
  console.log('\n=== after a reload (must match the choices above) ===');
  console.log(
    `htmlLang=${reloaded.htmlLang}  theme=${reloaded.theme}/${reloaded.themePreference}  ` +
      `storedLanguage=${reloaded.storedLanguage}  storedTheme=${reloaded.storedTheme}`
  );

  if (shotPath) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(shotPath), { recursive: true });
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log(`\nscreenshot -> ${shotPath}`);
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
