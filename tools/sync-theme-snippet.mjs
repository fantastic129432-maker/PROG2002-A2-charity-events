/**
 * sync-theme-snippet.mjs
 * ---------------------------------------------------------------------------
 * Injects the early theme script into the <head> of every page.
 *
 * Why an inline script at all: the preferred theme is stored in localStorage,
 * which the page can only read once JavaScript runs. If that happened after the
 * stylesheet was applied, a visitor who chose dark would see a white flash on
 * every page load. The snippet runs before the first paint instead.
 *
 * Why it is generated: the snippet duplicates the storage key and the attribute
 * name used by js/theme.js. Keeping a single source (EARLY_THEME_SNIPPET in that
 * module) and writing it into the pages means the two cannot drift apart.
 *
 * Usage:
 *   node tools/sync-theme-snippet.mjs          write the snippet into the pages
 *   node tools/sync-theme-snippet.mjs --check   fail if a page is out of date
 */
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = path.resolve('clientside');
const PAGES = ['index.html', 'search.html', 'event.html'];
const MARKER_START = '<!-- theme-boot -->';
const MARKER_END = '<!-- /theme-boot -->';
const CHECK_ONLY = process.argv.includes('--check');

/** Read the snippet straight out of js/theme.js so there is one source. */
function readSnippet() {
  const source = fs.readFileSync(path.join(CLIENT, 'js', 'theme.js'), 'utf8');
  const match = source.match(/export const EARLY_THEME_SNIPPET\s*=\s*([\s\S]*?);\n/);
  if (!match) throw new Error('EARLY_THEME_SNIPPET was not found in js/theme.js');

  // The literal is a series of concatenated string literals; evaluate it.
  const expression = match[1].trim();
  // eslint-disable-next-line no-new-func
  return new Function(`return ${expression};`)();
}

const snippet = readSnippet();
const block = `${MARKER_START}\n  <script>${snippet}</script>\n  ${MARKER_END}`;

let problems = 0;

for (const page of PAGES) {
  const file = path.join(CLIENT, page);
  const html = fs.readFileSync(file, 'utf8');

  const hasBlock = html.includes(MARKER_START) && html.includes(MARKER_END);
  const withBlock = hasBlock
    ? html.replace(
        new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
        block
      )
    : html.replace(/(\s*)<link rel="stylesheet"/, `\n  ${block}$1<link rel="stylesheet"`);

  if (withBlock === html) {
    console.log(`  ${page}: up to date`);
    continue;
  }

  if (CHECK_ONLY) {
    console.log(`  ${page}: OUT OF DATE - run node tools/sync-theme-snippet.mjs`);
    problems += 1;
    continue;
  }

  fs.writeFileSync(file, withBlock, 'utf8');
  console.log(`  ${page}: snippet written`);
}

if (CHECK_ONLY && problems > 0) {
  process.exit(1);
}
