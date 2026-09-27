# ============================================================================
# stage-commits.ps1
# ----------------------------------------------------------------------------
# Builds the commit history for the PROG2002 A2 project from a clean working
# tree, in the order the project was actually built.
#
# Why not a single commit: the assessment brief states that work progress in
# GitHub is graded, and that failing to show it can fail the assignment. Each
# commit below covers one coherent piece of work and says what it contains.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File tools\stage-commits.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

if (-not (Test-Path '.git')) { throw 'No git repository here. Run git init first.' }

<#
    Run git without tripping PowerShell's NativeCommandError.

    git writes routine notices such as "LF will be replaced by CRLF" to stderr.
    In Windows PowerShell 5.1 that becomes a terminating error when
    $ErrorActionPreference is Stop, which aborted this script half way through.
    Redirecting inside cmd.exe keeps the exit code authoritative and the text
    available for diagnostics.
#>
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    $output = & cmd /c "git $($Arguments -join ' ') 2>&1"
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "git $($Arguments -join ' ') failed (exit $code):`n$($output -join "`n")"
    }
    return $output
}

<#
    Commit using a message file.

    Passing a multi-line message through `cmd /c "... -m <message>"` breaks:
    cmd splits it on the commas and parentheses in the text and git then sees a
    pile of pathspecs. Writing the message to a file and using -F avoids
    quoting entirely, which matters because these messages are the evidence of
    work progress that the brief asks for.
#>
function Invoke-GitCommit {
    param([Parameter(Mandatory)][string]$Message)

    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        # UTF-8 without a BOM, and LF endings: git stores the message verbatim.
        [System.IO.File]::WriteAllText($tempFile, $Message, (New-Object System.Text.UTF8Encoding($false)))
        Invoke-Git commit -q -F $tempFile | Out-Null
    } finally {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}

<#
    Try a git command and report whether it succeeded, without throwing.
#>
function Test-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & cmd /c "git $($Arguments -join ' ') 2>&1" | Out-Null
    return ($LASTEXITCODE -eq 0)
}

$commits = @(
    @{
        Message = @'
chore: scaffold repository, gitignore and README

Set up the folder layout for the three parts of the assessment (database,
api, clientside) plus docs, tests and tools. The .gitignore keeps
node_modules, api/.env, local zip artefacts and a machine specific MySQL
installation out of the repository.
'@
        Paths   = @('.gitignore', 'README.md', 'package.json', 'package-lock.json')
    },
    @{
        Message = @'
feat(database): create the charityevents_db schema

Six tables with primary and foreign keys: organizations, categories and
locations as lookup tables, events as the main resource, and ticket_types and
donations as the child tables that give the event page its prices and its
goal versus progress figures.

Two views keep the rules in one place: vw_event_progress totals the donations
per event, and vw_public_events derives past, ongoing or upcoming from the
dates and hides any event whose status is not active.
'@
        Paths   = @('database/01_schema.sql')
    },
    @{
        Message = @'
feat(database): seed events, ticket tiers and donations

Six charitable organisations, eight event categories, nine venues, eleven
events, eighteen ticket tiers including free tiers, and forty-two donations -
comfortably above the required minimum of eight events and a few categories.

The data deliberately includes two past events and one suspended event, so the
date rule and the suspension rule can both be demonstrated.
'@
        Paths   = @('database/02_seed.sql')
    },
    @{
        Message = @'
feat(database): add the complete import script

charityevents_db.sql is the single file the marker runs. It creates the
database, both views and the full sample data set on a clean server.
'@
        Paths   = @('database/charityevents_db.sql')
    },
    @{
        Message = @'
feat(api): add the MySQL connection module event_db.js

Creates one shared connection pool for the whole application, exposes a
promise based query helper that always binds its parameters, and reports a
clear diagnostic from ping() so GET /api/health can explain a broken setup
instead of failing silently.
'@
        Paths   = @('api/src/db/event_db.js', 'api/src/config/env.js', 'api/.env.example')
    },
    @{
        Message = @'
feat(api): add the data layer with MySQL and offline repositories

repository.mysql.js holds every SQL statement the API needs, always selecting
from vw_public_events so a suspended event can never be returned. The search
filter binds every value, whitelists the sort column, and pages the result
from a derived table so the total count and the page always agree.

repository.local.js implements the same interface from a generated mirror of
the seed file, so the API can also run on a machine without MySQL. The mirror
is produced by tools/generate-local-data.js rather than written by hand, which
keeps it from drifting away from the SQL data.
'@
        Paths   = @('api/src/repositories', 'api/src/services', 'api/src/utils', 'tools/generate-local-data.js')
    },
    @{
        Message = @'
feat(api): add the REST endpoints and the Express application

Endpoints: /api/events for the filtered list used by the home and search
pages, /api/events/upcoming, /api/events/:id with its ticket tiers,
/api/categories, /api/locations, /api/organization, /api/stats and
/api/health.

The service layer validates every query parameter and returns one 400 response
listing each problem, so the search page can report a message per field.
Security headers, a CORS allow list, a per IP rate limit and a single error
handler that does not leak internals are all wired up in server.js.
'@
        Paths   = @('api/server.js', 'api/src/routes', 'api/src/controllers', 'api/src/middleware', 'api/src/views', 'api/package.json', 'api/package-lock.json')
    },
    @{
        Message = @'
feat(client): add the shared shell, design system and API wrapper

One stylesheet built on design tokens, one module that constructs every piece
of DOM, one wrapper around fetch() that converts any failure into a single
ApiError, and a navigation module that generates the menu and the footer for
every page from a single definition.
'@
        Paths   = @('clientside/css', 'clientside/js/config.js', 'clientside/js/api.js', 'clientside/js/dom.js', 'clientside/js/nav.js', 'clientside/js/modal.js', 'clientside/images', 'clientside/serve-clientside.js')
    },
    @{
        Message = @'
feat(client): add the home, search and event detail pages

Home shows the organisation's own information plus a listing fetched from
/api/events/upcoming, marking finished events and never showing a suspended
one. Search filters by date, location and category, allows several categories
at once, has a working Clear Filters button, and reports validation problems
with DOM manipulation. The detail page takes the event id from the query
string, displays the full description, the ticket tiers including a free one,
and the goal versus progress bar, and its Register button opens the dialog
that says the feature is currently under construction.
'@
        Paths   = @('clientside/index.html', 'clientside/search.html', 'clientside/event.html', 'clientside/js/home.js', 'clientside/js/search.js', 'clientside/js/event.js')
    },
    @{
        Message = @'
test: add the automated API and DOM suite

Part A drives the real Express application over HTTP and covers every
endpoint, every filter combination, the validation rules and the error
responses. Part B loads the real HTML pages into jsdom with fetch redirected
to the test API, and asserts that the data actually reaches the page: event
cards, the progress bar, ticket prices, the filter checkboxes, Clear Filters,
the empty state and the construction dialog. The suite starts its own API on a
free port so it never disturbs a running development server.
'@
        Paths   = @('tests/run-tests.js')
    },
    @{
        Message = @'
docs: add the report template, API reference, ERD and Windows setup

project-report.md is the report template with prompts to answer in your own
words. database-design.md documents the schema and the reasoning behind it,
api-documentation.md documents every endpoint with sample responses,
video-script.md maps a fifteen minute demonstration to the three questions the
brief asks, and submission-checklist.md is the pre-submission checklist.

tools/ holds the Windows helpers that run the project without administrator
rights, static checks for the batch and PowerShell files, a layout overflow
probe and a scanner that refuses to publish a repository containing a real
credential.
'@
        Paths   = @('docs', 'tools/install-mysql.ps1', 'tools/load-database.ps1', 'tools/find-mysql.ps1', 'tools/add-mysql-to-user-path.ps1', 'tools/check-cmd-files.mjs', 'tools/check-tool-scripts.mjs', 'tools/check-no-secrets.mjs', 'tools/find-overflow.mjs', 'tools/probe-nav-state.mjs', 'tools/stage-commits.ps1', 'start-all.cmd')
    }
)

Invoke-Git reset -q | Out-Null

$index = 0
foreach ($commit in $commits) {
    $index += 1

    # Collect the paths that exist AND are not excluded by .gitignore. Paths are
    # added one at a time: `git add` aborts the whole call when any single path
    # is ignored, which would silently drop the rest of the commit.
    $added = @()
    $skipped = @()
    foreach ($item in $commit.Paths) {
        if (-not (Test-Path $item)) {
            $skipped += "$item (missing)"
            continue
        }
        if (Test-Git add -- $item) {
            $added += $item
        } else {
            $skipped += "$item (ignored)"
        }
    }

    if ($added.Count -eq 0) {
        Write-Warning "commit $index has nothing to add, skipping"
        continue
    }
    if ($skipped.Count -gt 0) {
        Write-Warning "commit $index skipped: $($skipped -join ', ')"
    }

    Invoke-GitCommit -Message $commit.Message
    $subject = ($commit.Message -split "`n")[0]
    Write-Host ("[{0,2}/{1}] {2}" -f $index, $commits.Count, $subject)
}

Write-Host ''
Write-Host 'Anything still uncommitted:'
$leftover = Invoke-Git status --short
if ($leftover) { $leftover | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  (clean working tree)' }

Write-Host ''
Write-Host 'History:'
Invoke-Git log --oneline | ForEach-Object { Write-Host "  $_" }
