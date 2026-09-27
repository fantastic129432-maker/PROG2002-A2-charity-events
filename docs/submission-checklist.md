# Submission checklist

PROG2002 Web Development II - Assessment 2
**Due:** 28 September 2026, 11:59 pm AEST/AEDT (Monday of Week 5) - **40%**

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
- [ ] The three pages work at 360 px, 768 px and 1440 px wide
- [ ] Tested in at least two browsers (for example Edge and Chrome/Firefox)

## D. Automated tests

- [ ] `node tests/run-tests.js` prints `47 passed, 0 failed`
- [ ] You have run the suite **after** your last code change

## E. Documentation and deliverables

- [ ] `docs/project-report.md` is complete: **every prompt answered in your own
      words**, no leftover `_placeholder_` text and no leftover blockquote prompts
- [ ] Report uses 12-point Arial with 1.5 line spacing
- [ ] ER diagram included in the report (export it from MySQL Workbench, or use
      the Mermaid diagram in `docs/database-design.md`)
- [ ] Screenshots included: home page, search page with results, event detail
      page, Postman success and Postman 400
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

```powershell
# api zip  (no node_modules, no .env with secrets)
$api = "usernameA2-api"
New-Item -ItemType Directory -Force $api | Out-Null
Copy-Item api\* $api -Recurse -Force
Remove-Item "$api\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$api\.env" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $api -DestinationPath "$api.zip" -Force

# clientside zip
$client = "usernameA2-clientside"
New-Item -ItemType Directory -Force $client | Out-Null
Copy-Item clientside\* $client -Recurse -Force
Compress-Archive -Path $client -DestinationPath "$client.zip" -Force
```

Then verify each one:

```powershell
Expand-Archive -Path "usernameA2-api.zip" -DestinationPath "_check-api" -Force
Get-ChildItem -Recurse "_check-api" | Select-Object FullName
```
