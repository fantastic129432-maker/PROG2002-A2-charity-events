/**
 * audit-theme-contrast.mjs
 * ---------------------------------------------------------------------------
 * Finds the class of dark-theme defect that broke the footer.
 *
 * The dark theme inverts the brand tokens: --brand-900 becomes a LIGHT teal so
 * that headings stay readable on a dark surface. Any component that used that
 * token as a BACKGROUND was therefore designed for a dark surface and, if it
 * also paints light text, becomes unreadable once the token flips.
 *
 * This script lists every rule that paints a background from a brand token,
 * together with the text colour that rule or its children set, so the pairs can
 * be reviewed by eye. It also reports which of them already have a
 * [data-theme='dark'] override.
 *
 * Usage: node tools/audit-theme-contrast.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const CSS = path.resolve('clientside/css/styles.css');
const source = fs.readFileSync(CSS, 'utf8');

/** Tokens whose value changes between the light and dark themes. */
const FLIPPED_TOKENS = [
  '--brand-900',
  '--brand-700',
  '--brand-500',
  '--brand-100',
  '--surface-0',
  '--surface-50',
  '--surface-100',
  '--line',
  '--ink-900',
  '--ink-700',
  '--ink-500',
];

/** Split the stylesheet into `selector { body }` pairs, ignoring media queries
 *  as separate entries (their inner rules are matched as well). */
function rules(text) {
  const found = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const selector = match[1].replace(/\s+/g, ' ').trim();
    const body = match[2];
    if (!selector || selector.startsWith('@')) continue;
    found.push({ selector, body });
  }
  return found;
}

const allRules = rules(source);

/** Is this rule inside the dark theme block? */
function isDarkRule(selector) {
  return selector.includes("[data-theme='dark']");
}

const backgrounds = [];

for (const rule of allRules) {
  const background = rule.body.match(/background(?:-color)?:\s*([^;]+);/);
  if (!background) continue;

  const token = FLIPPED_TOKENS.find((name) => background[1].includes(`var(${name})`));
  if (!token) continue;

  const colour = rule.body.match(/(?:^|;)\s*color:\s*([^;]+);/);
  backgrounds.push({
    selector: rule.selector,
    token,
    background: background[1].trim(),
    color: colour ? colour[1].trim() : null,
    dark: isDarkRule(rule.selector),
  });
}

console.log('Rules that paint a background from a theme-flipped token:\n');
console.log(
  '  ' +
    'selector'.padEnd(46) +
    'token'.padEnd(16) +
    'text colour'.padEnd(20) +
    'dark override'
);
console.log('  ' + '-'.repeat(96));

for (const entry of backgrounds) {
  console.log(
    '  ' +
      entry.selector.slice(0, 45).padEnd(46) +
      entry.token.padEnd(16) +
      String(entry.color || '(inherited)').slice(0, 19).padEnd(20) +
      (entry.dark ? 'yes' : 'NO')
  );
}

/* Which selectors are referenced by a dark rule at all? */
const darkSelectors = new Set(
  allRules
    .filter((rule) => isDarkRule(rule.selector))
    .map((rule) => rule.selector.replace(/\[data-theme='dark'\]\s*/, '').trim())
);

console.log('\nSelectors with a background from a flipped token and NO dark rule:');
const risky = backgrounds.filter(
  (entry) => !entry.dark && ![...darkSelectors].some((dark) => dark === entry.selector)
);

if (risky.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of risky) {
    console.log(`  ${entry.selector}  ->  background ${entry.background}, text ${entry.color || 'inherited'}`);
  }
}

console.log(`\n${backgrounds.length} rule(s) reviewed, ${risky.length} without a dark theme rule.`);
