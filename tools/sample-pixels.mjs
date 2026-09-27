/**
 * sample-pixels.mjs
 * ---------------------------------------------------------------------------
 * Screenshots the page, decodes the PNG and reports the full-width rows that
 * contain a distinctly coloured horizontal line.
 *
 * Written to settle the "yellow line" report with evidence: a screenshot alone
 * leaves the colour and the position open to interpretation, and scanning the
 * DOM for warm borders found nothing, so the pixels are measured directly.
 *
 * Usage:
 *   node tools/sample-pixels.mjs --url http://127.0.0.1:5500/index.html \
 *     --theme dark --scroll 900 --out .shots/pixels.png
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const url = value('url', 'http://127.0.0.1:5500/index.html');
const theme = value('theme', 'dark');
const scrollTo = Number(value('scroll', 0));
const out = value('out', '.shots/pixels.png');
const viewportWidth = Number(value('width', 1400));
const viewportHeight = Number(value('height', 1000));

const PORT = 9200 + (process.pid % 60);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const profile = path.join(os.tmpdir(), `dsh-pixels-${Date.now()}`);
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${viewportWidth},${viewportHeight}`,
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

/* ---------------------------------------------------------------- */
/* Minimal PNG decoder: 8-bit RGB or RGBA, no interlacing           */
/* ---------------------------------------------------------------- */
function decodePng(buffer) {
  let offset = 8; // skip the signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported colour type ${colourType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i += 1) {
      const rawByte = line[i];
      const left = i >= channels ? target[i - channels] : 0;
      const up = previous ? previous[i] : 0;
      const upLeft = previous && i >= channels ? previous[i - channels] : 0;

      let restored;
      switch (filter) {
        case 0: restored = rawByte; break;
        case 1: restored = rawByte + left; break;
        case 2: restored = rawByte + up; break;
        case 3: restored = rawByte + Math.floor((left + up) / 2); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          restored = rawByte + predictor;
          break;
        }
        default: throw new Error(`unknown filter ${filter}`);
      }
      target[i] = restored & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

const hex = (r, g, b) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

try {
  await waitForDevTools();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const { send, close } = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('charity-events:theme', ${JSON.stringify(theme)});`,
  });

  await send('Page.navigate', { url });
  await sleep(4000);

  if (scrollTo > 0) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scrollTo});` });
    await sleep(1200);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

  const image = decodePng(fs.readFileSync(out));
  console.log(`screenshot ${image.width}x${image.height} -> ${out}`);

  // A line is a row whose left third is almost one colour and clearly differs
  // from the rows above and below it.
  const sampleX = Math.floor(image.width * 0.25);
  const rowColour = (y) => {
    const i = (y * image.width + sampleX) * image.channels;
    return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
  };

  const lines = [];
  for (let y = 1; y < image.height - 1; y += 1) {
    const above = rowColour(y - 1);
    const here = rowColour(y);
    const below = rowColour(y + 1);
    const differs = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 40;
    if (differs(here, above) && differs(here, below)) lines.push({ y, colour: hex(...here) });
  }

  console.log(`\n${lines.length} single-row horizontal line(s) detected at x=${sampleX}:`);
  for (const line of lines) console.log(`  y=${line.y}  ${line.colour}`);

  /*
   * A full-width line that is clearly warm (yellow, amber, orange) is what the
   * "yellow line" report describes. It is checked across the whole row, not at
   * one x, so a coloured card graphic cannot be mistaken for a page-wide line.
   */
  const warmRows = [];
  for (let y = 0; y < image.height; y += 1) {
    let warm = 0;
    let sampled = 0;
    for (let x = 20; x < image.width - 20; x += 20) {
      const i = (y * image.width + x) * image.channels;
      const r = image.pixels[i];
      const g = image.pixels[i + 1];
      const b = image.pixels[i + 2];
      sampled += 1;
      if (r > 120 && g > 80 && r - b > 60 && g - b > 25) warm += 1;
    }
    if (sampled > 0 && warm / sampled > 0.6) warmRows.push({ y, ratio: warm / sampled });
  }

  console.log(`\nfull-width warm rows (over 60% of sampled pixels are yellow/amber): ${warmRows.length}`);
  for (const row of warmRows.slice(0, 20)) {
    console.log(`  y=${row.y}  ratio=${row.ratio.toFixed(2)}  ${hex(...rowColour(row.y))}`);
  }

  // Also report the vertical colour profile so a reviewer can see the structure.
  console.log('\ncolour every 40 rows:');
  for (let y = 0; y < image.height; y += 40) {
    console.log(`  y=${String(y).padStart(4)}  ${hex(...rowColour(y))}`);
  }

  close();
} catch (error) {
  console.error('Sampling failed:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
