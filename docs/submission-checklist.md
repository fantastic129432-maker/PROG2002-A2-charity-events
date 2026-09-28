# Submission checklist

PROG2002 Web Development II - Assessment 2
**Due:** 5 October 2026, 11:59 pm AEDT - **40%**

> The Unit Assessor posted two corrections on 28 September 2026 that change the
> rules for this assessment. Read section **H** at the end of this file before
> submitting: the deadline moved from 28 September to 5 October, the report
> template was replaced, no CSS or JavaScript framework is permitted, and AI use
> now requires the official prompt plus screenshots of your chat log.

Work through this list top to bottom before you submit. Tick nothing you have
not actually verified.

---

## A. Database (Part 1 - 15%)

- [ ] `charityevents_db` is created by `database/charityevents_db.sql`
- [ ] The script was run on a **clean** server and completed without errors
      (verified here on MySQL 8.4.11 Community Server)
- [ ] MySQL 8.0.1 or newer is used (the dump uses the `utf8mb4_0900_ai_ci` collation)
- [ ] On this computer MySQL is the Windows service **MySQL84** (8.4.11) and the
      API reads it with the read-only account `charity_app`
- [ ] `SELECT COUNT(*) FROM events;` returns 11
- [ ] Tables exist with primary and foreign keys: `organizations`, `categories`,
      `locations`, `events`, `ticket_types`, `donations`
- [ ] Views exist: `vw_event_progress`, `vw_public_events`
- [ ] At least **8 events** (this project seeds 11) and several categories are present
- [ ] `SELECT COUNT(*) FROM events;` returns 11
- [ ] `event_db.js` exists, is named exactly, and connects to MySQL using a pool
- [ ] `event_db.js` was proof-read for hard-coded passwords (use `.env`)
- [ ] The SQL file is attached to the submission

## B. REST API (Part 2 - 20%)

- [ ] `cd api && npm install` completes
- [ ] `api/.env` exists (copied from `.env.example`) with the correct DB password
- [ ] `npm start` prints "Database : connected"
- [ ] `GET /api/health` returns 200
- [ ] `GET /api/events` returns upcoming events with their category
- [ ] `GET /api/events` filters by **date**, **location** and **category**,
      individually and combined
- [ ] `GET /api/categories` and `GET /api/locations` return filter options
- [ ] `GET /api/events/:id` returns full detail including `ticketTypes`
- [ ] Invalid input returns 400 with field details; unknown ids return 404
- [ ] The suspended event (id 11) returns 404 and appears in no list
- [ ] A Postman collection has been built and exported (include it in the zip)
- [ ] No `POST`, `PUT` or `DELETE` endpoints exist (they belong to A3)

## C. Client-side website (Part 3 - 45%)

- [ ] `node serve-clientside.js` runs and `http://localhost:5500/index.html` opens
- [ ] **Home page**: static organisation information is visible
- [ ] **Home page**: the event list is loaded from the API (check the Network tab)
- [ ] **Home page**: each card shows name, category, location, date, price,
      image and progress, and links to the detail page
- [ ] **Home page**: no past event and no suspended event appears
- [ ] **Menu**: present and working on all three pages
- [ ] **Search page**: date, location and category controls all work
- [ ] **Search page**: more than one category can be selected at once
- [ ] **Search page**: criteria combine (test Lismore + Fun Run + a date range)
- [ ] **Search page**: **Clear Filters** resets everything
- [ ] **Search page**: error messages are shown for invalid input
- [ ] **Search page**: an empty result set shows a helpful message, not a blank page
- [ ] **Detail page**: only the selected event is shown
- [ ] **Detail page**: full description, venue, times, capacity and purpose
- [ ] **Detail page**: ticket prices shown, including a free tier
- [ ] **Detail page**: goal vs. progress bar with real figures
- [ ] **Detail page**: **Register** shows "This feature is currently under construction."
- [ ] No AngularJS anywhere (the brief forbids it for A2)
- [x] The three pages work at 360 px, 768 px and 1440 px wide. Verified with a
      headless browser: all nine page/width combinations report **0 px** of
      horizontal overflow, with no element extending past the viewport
- [ ] Tested in at least two browsers. **Only Microsoft Edge is installed on this
      machine**, so this cannot be ticked as written. The brief does not ask for
      it, and Edge and Chrome share the same engine, so the meaningful second
      test would be Firefox - install it and open the three pages if you want
      the stronger claim. The report's *Legibility, responsiveness and
      accessibility* section describes measured contrast, not browser coverage,
      so nothing in the report overstates this

## D. Automated tests

- [ ] `node tests/run-tests.js` prints `61 passed, 0 failed`
- [ ] You have run the suite **after** your last code change

## E. Documentation and deliverables

- [ ] `docs/project-report.md` is complete: **every prompt answered in your own
      words**, no leftover `_placeholder_` text and no leftover blockquote prompts
- [x] Report uses 12-point Arial with 1.5 line spacing. Verified in the file
      itself: 234 runs at Arial 12 pt and 81 paragraphs at 1.5 line spacing.
      Code samples and figure captions are the exceptions - Consolas 10 pt and
      Arial italic 10 pt - which is intentional so that code and captions are
      visually distinct from body text
- [x] ER diagram included in the report as **Figure 4**, under *Data Schema*
      (page 10). Source: `docs/report-images/06-er-diagram.png`
- [x] Screenshots included: home page (Figure 1, page 5), search page with
      results (Figure 2, page 6) and event detail page (Figure 3, page 8). The
      report is now 17 pages with six figures in total
- [ ] **Postman success and Postman 400 are still outstanding.** Figures 5 and 6
      show the live API response (request line, status and body), which is
      equivalent evidence, but the checklist above asks for Postman
      screenshots specifically. Take those two in Postman while you record the
      video and replace Figures 5 and 6, or add them as Figures 7 and 8
- [ ] The report's section titles are bold body text, not Word heading styles,
      so the document has no navigation pane and no automatic table of
      contents. Apply **Heading 1** to each section title if the marker expects
      a structured document
- [ ] The GenAI declaration is included, with the correct option chosen
- [ ] `usernameA2-api.zip` built (replace `username` with your SCU username)
- [ ] `usernameA2-clientside.zip` built
- [ ] Both zips open correctly and contain the expected folders
- [ ] `.env` is **not** inside the zip if it contains a real password
      (`.env.example` should be there instead)
- [ ] `node_modules` is **not** inside either zip
- [ ] The GitHub link is in the submission and is accessible to the marker
- [ ] The repository is private, or the marker has been invited as a collaborator
- [ ] The video is uploaded to SCU OneDrive, the link is shareable and you have
      tested it in a private browser window
- [ ] The video is under 15 minutes and answers all three required questions
- [ ] The submission link on Blackboard has been completed

## F. GitHub evidence (explicitly graded)

- [ ] The repository has a meaningful commit history, not one giant commit
- [ ] Commit messages explain **what changed**, for example
      `feat(api): add date, location and category filters to /api/events`
- [ ] Commits show the real order of work: database, then API, then client
- [ ] No secret (database password, API key) appears anywhere in the history

## G. Final read-through

- [ ] Open the report and read it start to finish as a marker would
- [ ] Open every file you would be asked about and confirm you can explain it
- [ ] Confirm the exact required sentences exist:
      * the Register dialog: **"This feature is currently under construction."**
      * the database name: **`charityevents_db`**
      * the connection file: **`event_db.js`**
- [ ] Submit with time to spare - late submissions may be penalised

---

## Build the two zips

Run these from the project root (`charity-events-a2`):

Replace `username` with your SCU username in the two variables.

```powershell
# api zip  (no node_modules, no .env with secrets, SQL and Postman collection included)
# Note: the database scripts live at the project root in database\, NOT inside api\,
# so they have to be copied in separately - the marker needs them for Part 1.
$api = "usernameA2-api"
Remove-Item $api -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $api | Out-Null
Copy-Item api\* $api -Recurse -Force
Remove-Item "$api\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$api\.env" -Force -ErrorAction SilentlyContinue
Copy-Item database "$api\database" -Recurse -Force
New-Item -ItemType Directory -Force "$api\postman" | Out-Null
Copy-Item "docs\postman\PROG2002-A2-Charity-Events-API.postman_collection.json" "$api\postman\"
Compress-Archive -Path $api -DestinationPath "$api.zip" -Force

# clientside zip
$client = "usernameA2-clientside"
Remove-Item $client -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $client | Out-Null
Copy-Item clientside\* $client -Recurse -Force
Compress-Archive -Path $client -DestinationPath "$client.zip" -Force

# the staging folders are not part of the repository
Remove-Item $api, $client -Recurse -Force
```

Then verify each one. The zip must contain no `.env` and no `node_modules`:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($z in @("usernameA2-api.zip", "usernameA2-clientside.zip")) {
  $a = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $z))
  "{0}: {1} entries" -f $z, $a.Entries.Count
  $bad = $a.Entries | Where-Object { $_.FullName -match '\\node_modules\\|\\\.env$' }
  if ($bad) { "  PROBLEM: " + ($bad.FullName -join ', ') } else { "  no .env, no node_modules" }
  $a.Dispose()
}
```

---

## H. Unit Assessor update, 28 September 2026

Two announcements changed the rules after this project was built. This section
records each one and exactly where the project stands.

### H1. The deadline moved

From **28 September** to **5 October 2026, 11:59 pm**. One extra week.

### H2. No CSS or JavaScript framework (this project complies)

> "You are NOT allowed to use any frameworks for CSS or Javascript. You may use
> the Express framework to build the server side script, that's all. Do not use
> any Templating provided by Express... Your webpages must be delivered using
> only HTML, CSS and JS."

Verified against the code, not assumed:

- [x] The API's only runtime dependencies are **`express`** and **`mysql2`**
      (a database driver, not a framework). The unused `cors` package was
      removed, because CORS headers are written by hand in
      `api/src/middleware/security.js`
- [x] No template engine anywhere: no `view engine`, no `res.render`, no EJS,
      Pug, Handlebars or Nunjucks. The API's one HTML page is served as a plain
      file with `res.sendFile()`
- [x] The client uses no framework and no library - no React, Vue, Angular,
      Svelte, jQuery, Bootstrap, Tailwind or Alpine
- [x] No CDN: every script, stylesheet and image is a local file. The three
      pages load one inline theme snippet and one ES module each
- [x] `jsdom` appears only in the root `package.json` as a **dev** dependency
      for the test suite. It is not part of the website and is not shipped in
      either zip
- [x] **The repository contains no PowerShell and no batch files.** The setup
      scripts were `.ps1` and `.cmd`, which made GitHub's language bar report
      "PowerShell 4.6%" and "Batchfile 0.9%" - not a breach of the rule above,
      which is about the webpages, but easy for a marker to misread. They are
      now JavaScript: `tools/start-all.mjs` replaces `start-all.cmd`, and
      `tools/load-database.mjs` replaces `load-database.ps1`. The installer
      scripts were deleted outright, because MySQL 8.4.11 is already installed
      and they had no further use. The language bar now shows JavaScript, CSS,
      HTML, SQL and JSON only. Nothing in the running application changed

### H3. The report template was replaced

An updated **PROG2002 A2 Report Template** is on SIE Moodle, together with an
**AI-Assignment-Prompt** file.

- [ ] **Download both from Moodle and check the report against the new
      template.** This report was written against the previous template, so its
      section headings and question order may no longer match. Nobody but you
      can download these files - they need your Moodle login

### H4. AI use now needs evidence

> "If you use AI in any capacity, please use the AI Prompt as provided... Please
> also include screenshots of your AI chat log with your report to show that you
> only asked AI questions to further your understanding and NOT to use AI to
> generate the code for you. Failure to provide the appropriate evidence will
> result in a loss of marks."

- [ ] **This is unresolved and it is the most serious item on this list.**
      The code, the report and the translations in this project were generated
      with an AI assistant, at the owner's request. That is generation, not
      question-asking, so an honest chat log cannot show what the Unit Assessor
      asks to see. Screenshots must not be manufactured to imply otherwise.

The only defensible routes from here:

1. **Rebuild the code yourself** and use AI only to ask questions. The one-week
   extension exists for exactly this kind of correction. Keep the real chat log,
   starting from the official prompt.
2. **Disclose the true extent of the AI use**, in the declaration and to the
   Unit Assessor, and be ready to explain every line. `docs/genai-declaration.md`
   gives the wording for the disclosure option.

What is *not* an option: submitting a chat log that shows only question-asking
when the log in fact contains the generation. That is the specific thing the
warning is about.

### H5. What the project can still do legitimately

Using AI to **understand** code is permitted and produces a genuine, submittable
log. That is the useful work available right now:

- walk through each file and explain what it does and why
- quiz yourself on a random function until you can explain it unaided
- ask why one approach was chosen over another, and what would break otherwise

The rule from `docs/genai-declaration.md` still stands on its own: if you cannot
explain a line, you cannot submit it.
