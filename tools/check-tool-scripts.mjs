/**
 * check-tool-scripts.mjs
 * ---------------------------------------------------------------------------
 * Static checks for the PowerShell tools, catching the mistakes that are easy
 * to make and only show up at run time:
 *
 *   1. Syntax errors (via the PowerShell parser, when pwsh/powershell is
 *      available).
 *   2. Use of the automatic read-only variables $HOME, $PWD, $PID, $Host or
 *      $Error as ordinary variables. PowerShell variable names are
 *      case-insensitive, so `$home = ...` fails with
 *      "Cannot overwrite variable HOME because it is read-only or constant".
 *      That bug actually happened in find-mysql.ps1, so it is now checked.
 *
 * Usage: node tools\check-tool-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOLS_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** Variables that PowerShell defines and will not let a script assign to. */
const RESERVED = ['home', 'pwd', 'pid', 'host', 'error', 'true', 'false', 'null'];

const files = fs
  .readdirSync(TOOLS_DIR)
  .filter((name) => name.toLowerCase().endsWith('.ps1'))
  .sort();

let problems = 0;

for (const file of files) {
  const fullPath = path.join(TOOLS_DIR, file);
  const text = fs.readFileSync(fullPath, 'utf8');
  const lines = text.split(/\r?\n/);
  console.log(`--- ${file} ---`);

  // 1. Reserved automatic variables must not be assigned or declared.
  lines.forEach((line, index) => {
    const stripped = line.replace(/#.*$/, ''); // ignore trailing comments
    const assignment = stripped.match(/\$([A-Za-z_][A-Za-z0-9_]*)\s*=/g) || [];
    for (const match of assignment) {
      const name = match.slice(1, -1).trim().toLowerCase();
      if (RESERVED.includes(name)) {
        console.log(
          `  RESERVED VARIABLE  line ${index + 1}: $${match.slice(1, -1).trim()} is read-only in PowerShell`
        );
        problems += 1;
      }
    }
    // param([string]$home) declarations are just as fatal, but a parameter list
    // also contains attribute blocks such as
    // [Parameter(ValueFromRemainingArguments = $true)] or [switch], where $true
    // is a value and not a name. Attributes are stripped first, then only the
    // tokens that begin a parameter - the first, and any after a comma - are
    // treated as names.
    const paramDecl = stripped.match(/param\s*\(([\s\S]*)\)\s*$/);
    if (paramDecl) {
      const withoutAttributes = paramDecl[1].replace(/\[[^\]]*\]/g, '');
      const declared = withoutAttributes
        .split(',')
        .map((entry) => entry.match(/\$([A-Za-z_][A-Za-z0-9_]*)/))
        .filter(Boolean);

      for (const match of declared) {
        const name = match[1];
        if (RESERVED.includes(name.toLowerCase())) {
          console.log(
            `  RESERVED PARAM     line ${index + 1}: $${name} is read-only in PowerShell`
          );
          problems += 1;
        }
      }
    }
  });

  // 2. Real syntax check, when a PowerShell host is available.
  const host = process.env.POWERSHELL_EXE || 'powershell.exe';
  try {
    const escaped = fullPath.replace(/'/g, "''");
    const output = execFileSync(
      host,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$null,[ref]$e) | Out-Null; if ($e.Count -gt 0) { $e | ForEach-Object { Write-Output $_.Message }; exit 1 }`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    if (output.trim()) {
      console.log(`  PARSE ERROR: ${output.trim()}`);
      problems += 1;
    } else {
      console.log('  syntax ok');
    }
  } catch (error) {
    const message = (error.stdout || error.stderr || error.message || '').trim();
    if (error.code === 'ENOENT') {
      console.log('  syntax check skipped (PowerShell not found)');
    } else {
      console.log(`  PARSE ERROR: ${message.split('\n')[0]}`);
      problems += 1;
    }
  }
}

console.log('');
console.log(problems === 0 ? 'No problems found.' : `${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
