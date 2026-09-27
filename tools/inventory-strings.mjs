/**
 * inventory-strings.mjs
 * ---------------------------------------------------------------------------
 * Lists every user-visible string in the client so the translation dictionary
 * can be built from a real inventory rather than guesswork.
 *
 * It reports:
 *   * text nodes in the HTML files,
 *   * user-visible attributes (placeholder, aria-label, title, alt, value),
 *   * string literals passed to el(), openModal() and showEmpty() in js/.
 *
 * Usage: node tools/inventory-strings.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = path.resolve('clientside');
const results = { html: {}, js: {} };

const SKIP_TAGS = /^(script|style)$/i;

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '-')
    .replace(/&times;/g, 'x')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

for (const file of fs.readdirSync(CLIENT).filter((f) => f.endsWith('.html'))) {
  const source = fs.readFileSync(path.join(CLIENT, file), 'utf8');

  // Strip comments first so commented-out copy is not counted.
  const body = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const found = [];

  // Text between tags.
  for (const match of body.matchAll(/>([^<>]+)</g)) {
    const text = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
    if (text.length > 1 && !/^[{};:,.]$/.test(text)) found.push(text);
  }

  // User-visible attributes.
  for (const match of body.matchAll(
    /\b(placeholder|aria-label|title|alt|value|aria-labelledby)="([^"]*)"/g
  )) {
    const [, attribute, value] = match;
    if (!value.trim()) continue;
    found.push(`[${attribute}] ${value.trim()}`);
  }

  const unique = [...new Set(found)];
  results.html[file] = unique;
  console.log(`\n=== ${file} : ${unique.length} strings ===`);
  for (const text of unique) console.log(`  ${text}`);
}

for (const file of fs.readdirSync(path.join(CLIENT, 'js')).filter((f) => f.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(CLIENT, 'js', file), 'utf8');
  const found = [];

  // Text handed to the DOM builders and to the modal.
  for (const match of source.matchAll(
    /\b(?:text|message|title|label|placeholder|alt|aria-label)\s*:\s*(?:'([^']{2,})'|`([^`]{2,})`|"([^"]{2,})")/g
  )) {
    const value = (match[1] || match[2] || match[3] || '').trim();
    if (value && !/^[\s{}]*$/.test(value)) found.push(value);
  }

  // Strings compared against event state, which are keys rather than copy.
  const unique = [...new Set(found)];
  results.js[file] = unique;
  console.log(`\n=== js/${file} : ${unique.length} strings ===`);
  for (const text of unique) console.log(`  ${text}`);
}

fs.writeFileSync(
  path.join('.string-inventory.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);
console.log('\nWritten to .string-inventory.json');
