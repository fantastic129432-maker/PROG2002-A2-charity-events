/**
 * Check a batch file for the two mistakes that are easy to make and hard to
 * see: an odd number of double quotes on a line that actually runs, and the
 * classic `set VAR=value` without surrounding quotes when the value contains
 * spaces or quotes.
 *
 * Usage: node .checkcmd.mjs start-all.cmd
 */
import fs from 'node:fs';

let problems = 0;

for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'latin1');
  const lines = text.split(/\r?\n/);

  console.log(`--- ${file} (${lines.length} lines) ---`);

  lines.forEach((line, index) => {
    const number = index + 1;
    const trimmed = line.trim();

    // Skip blank lines, comments and echoing.
    if (
      trimmed === '' ||
      /^rem\b/i.test(trimmed) ||
      /^::/.test(trimmed) ||
      /^echo\b/i.test(trimmed)
    ) {
      return;
    }

    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 !== 0) {
      console.log(`  UNBALANCED QUOTES  line ${number}: ${JSON.stringify(line)}`);
      problems += 1;
    }

    // set VAR=..., 'set /a', 'set /p' and quoted 'set "VAR=..."' are fine.
    const setMatch = trimmed.match(/^set\s+([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/i);
    if (setMatch) {
      const value = setMatch[2];
      if (value !== '' && value !== value.trim()) {
        console.log(`  TRAILING SPACE     line ${number}: ${JSON.stringify(line)}`);
        problems += 1;
      }
    }
  });

  // Every label that is jumped to must exist.
  const labels = new Set(
    lines
      .map((line) => line.trim().match(/^:([A-Za-z0-9_]+)\s*$/))
      .filter(Boolean)
      .map((match) => match[1].toLowerCase())
  );
  const gotos = [...text.matchAll(/\bgoto\s+([A-Za-z0-9_]+)/gi)].map((m) => m[1].toLowerCase());
  for (const target of new Set(gotos)) {
    if (!labels.has(target)) {
      console.log(`  MISSING LABEL      goto ${target}`);
      problems += 1;
    }
  }
}

console.log('');
console.log(problems === 0 ? 'No problems found.' : `${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
