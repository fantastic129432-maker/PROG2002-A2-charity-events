# Charity Events Website - PROG2002 Assessment 2

A dynamic charity events website built for the PROG2002 Web Development II
case study: **"develop a dynamic website to manage charity events in your city"**.

The project has three parts, exactly as the assessment brief defines them:

| Part | Deliverable | Where it lives |
| --- | --- | --- |
| 1 (15%) | MySQL database `charityevents_db` | `database/` |
| 2 (20%) | RESTful API with NodeJS + ExpressJS | `api/` |
| 3 (45%) | Client-side website with HTML, JavaScript and DOM | `clientside/` |

---

## 1. Quick start

You need **Node.js 18 or newer**. MySQL is used for the submitted
configuration; the API can also run without MySQL so the site can be marked
anywhere (see step 4).

### The easy way (Windows)

```bat
start-all.cmd
```

That opens three windows - MySQL, the API and the website - and then opens
<http://localhost:5500/index.html> for you. Close the three windows to stop
everything.

### The step-by-step way

```bash
# ---------- Part 1: the database ----------
# MySQL 8.0.1+ required. In MySQL Workbench:
#   File > Open SQL Script > database/charityevents_db.sql
#   then click the lightning bolt to run the whole script.
# Or from a terminal, with a local MySQL server running:
mysql -u root -p < database/charityevents_db.sql

# ---------- Part 2: the API ----------
cd api
npm install
copy .env.example .env      # Windows  (cp .env.example .env on macOS/Linux)
# edit .env and set DB_PASSWORD to your own MySQL password
npm start                   # http://localhost:3000

# ---------- Part 3: the client website ----------
# In a second terminal
cd clientside
node serve-clientside.js    # http://localhost:5500
```

Then open **http://localhost:5500/index.html**.

> The client must be served over `http://`, not opened as a `file://` path.
> Browsers block ES modules and cross-origin `fetch()` from the file system.

### Verify everything at once

```bash
node tests/run-tests.js                     # 47 checks using the offline data source
set TEST_DATA_SOURCE=mysql && node tests/run-tests.js   # the same 47 checks against MySQL
```

The suite starts its own API instance, then runs **47 checks**: every endpoint,
every search filter, validation and error handling, plus DOM tests that load
the real HTML pages and confirm the data actually reaches the page (event
cards, progress bar, ticket prices, filter checkboxes, Clear Filters and the
"under construction" modal).

---

## 1a. MySQL on this computer

MySQL runs here as the **official MySQL Server 8.4** installed with the MySQL
Installer and registered as a Windows service:

| | |
| --- | --- |
| Version | MySQL Community Server **8.4.11** |
| Program files | `C:\Program Files\MySQL\MySQL Server 8.4` |
| Data | `C:\ProgramData\MySQL\MySQL Server 8.4\Data` |
| Config | `C:\ProgramData\MySQL\MySQL Server 8.4\my.ini` |
| Windows service | **MySQL84** - starts automatically with Windows |
| Port | 3306 (plus 33060 for the X Plugin) |
| Collation | `utf8mb4_0900_ai_ci` - matches the schema |
| Client tools | `mysql.exe`, `mysqladmin.exe`, `mysqldump.exe` in the `bin` folder |

Two database accounts are used:

| Account | Privileges | Used by |
| --- | --- | --- |
| `root` | full | `tools\load-database.ps1` when (re)creating the database |
| `charity_app` | `SELECT` on `charityevents_db` only | the API, through `api\.env` |

The API account is deliberately read-only, because Assessment 2 only reads.
A stray `DELETE` is rejected by the server with error 1142, which is worth
mentioning in the video as a security decision.

The real password lives only in `api\.env`, which is git-ignored and excluded
from the submission zips; `api\.env.example` carries a placeholder instead.

Because MySQL is a Windows service, `start-all.cmd` checks whether port 3306
answers before doing anything, so it never tries to start a second server. The
service starts with Windows, so in practice you normally only need:

```bat
start-all.cmd          :: API + website (MySQL is already running)
```

Reloading the database with root after changing `database\02_seed.sql`:

```powershell
powershell -ExecutionPolicy Bypass -File tools\load-database.ps1 -User root -Password "your_root_password"
```

### If you install a different MySQL instead

`tools\find-mysql.ps1` is used by every script and searches, in order:
`-MySQLHome`, `%MYSQL_HOME%`, `Program Files\MySQL\MySQL Server *`,
`%USERPROFILE%\mysql`, `<project>\mysql`, then `mysqld.exe` on `PATH`. A
per-user installation therefore keeps working without editing anything:

```powershell
node tools\download-mysql-parallel.mjs
powershell -ExecutionPolicy Bypass -File tools\install-mysql.ps1 -AddToPath
powershell -ExecutionPolicy Bypass -File tools\load-database.ps1 -User root
```

---

## 2. Folder structure

```
charity-events-a2/
鈹溾攢 database/                    Part 1
鈹? 鈹溾攢 charityevents_db.sql      complete dump - run this one
鈹? 鈹溾攢 01_schema.sql             database, 6 tables, 2 views
鈹? 鈹斺攢 02_seed.sql               6 organisations, 8 categories, 11 events, tickets, donations
鈹溾攢 api/                         Part 2  -> usernameA2-api.zip
鈹? 鈹溾攢 server.js                 Express application entry point
鈹? 鈹溾攢 .env.example              configuration template
鈹? 鈹斺攢 src/
鈹?    鈹溾攢 db/event_db.js         REQUIRED filename: the MySQL connection
鈹?    鈹溾攢 repositories/          all SQL (mysql) + offline twin (local)
鈹?    鈹溾攢 services/              query validation and business rules
鈹?    鈹溾攢 controllers/           HTTP layer
鈹?    鈹溾攢 routes/apiRoutes.js    the REST endpoints
鈹?    鈹溾攢 middleware/            security headers, CORS, rate limit, errors
鈹?    鈹斺攢 views/api-index.html   human-readable API index
鈹溾攢 clientside/                  Part 3  -> usernameA2-clientside.zip
鈹? 鈹溾攢 index.html                Home page
鈹? 鈹溾攢 search.html               Search events page
鈹? 鈹溾攢 event.html                Event detail page
鈹? 鈹溾攢 css/styles.css            one stylesheet, design tokens at the top
鈹? 鈹溾攢 js/config.js              API base URL
鈹? 鈹溾攢 js/api.js                 all fetch() calls, one error type
鈹? 鈹溾攢 js/dom.js                 every DOM builder and formatter
鈹? 鈹溾攢 js/nav.js                 the menu + footer used on all three pages
鈹? 鈹溾攢 js/home.js                Home page controller
鈹? 鈹溾攢 js/search.js              Search page controller
鈹? 鈹溾攢 js/event.js               Event detail controller
鈹? 鈹溾攢 js/modal.js               the "under construction" dialog
鈹? 鈹斺攢 images/*.svg              offline artwork (no external requests)
鈹溾攢 tests/run-tests.js           automated checks for the whole submission
鈹溾攢 tools/
鈹? 鈹溾攢 generate-local-data.js    regenerates the offline data from 02_seed.sql
鈹? 鈹溾攢 find-mysql.ps1            locates the MySQL installation to use
鈹? 鈹溾攢 download-mysql-parallel.mjs  downloads the official MySQL ZIP archive
鈹? 鈹溾攢 install-mysql.ps1         per-user MySQL install (no admin rights)
鈹? 鈹溾攢 load-database.ps1         loads charityevents_db.sql and verifies it
鈹? 鈹斺攢 add-mysql-to-user-path.ps1   puts mysql.exe on your user PATH
鈹溾攢 start-all.cmd                starts MySQL + API + website in three windows
鈹斺攢 docs/                        report, API docs, ERD, video script
```

---

## 3. Database design summary

Six tables with primary and foreign keys:

```
organizations 鈹€鈹€鈹?categories    鈹€鈹€鈹尖攢鈹€< events >鈹€鈹€鈹攢鈹€< ticket_types
locations     鈹€鈹€鈹?             鈹斺攢鈹€< donations
```

* `events.status` (`active` / `suspended` / `cancelled`) is the publishing flag.
  Suspended events are filtered out by the view `vw_public_events`, so they can
  never appear on the public website.
* `upcoming` / `ongoing` / `past` is **derived** from `date_start`, `date_end`
  and `CURDATE()`. It is not stored, so the site is always correct without a
  scheduled job.
* `vw_event_progress` totals the `donations` rows per event, which is what the
  "Goal vs. Progress" bar displays.

Full table dictionary and ER diagram: `docs/database-design.md`.

---

## 4. Running without MySQL (marker-friendly fallback)

`api/.env` has a `DATA_SOURCE` setting:

```ini
DATA_SOURCE=mysql   # default: read from the MySQL database
DATA_SOURCE=local   # read the same sample data from a generated JS mirror
```

With `DATA_SOURCE=local` the API starts with no database server at all and
serves exactly the same data, because `api/src/repositories/local-data.js` is
generated from `database/02_seed.sql` by `tools/generate-local-data.js`. This
exists so the client website can always be demonstrated, and it is also how the
automated test suite runs.

---

## 5. API endpoints (summary)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API and database status |
| GET | `/api` | Index of the API |
| GET | `/api/events` | Filtered event list (home + search) |
| GET | `/api/events/upcoming` | Current and upcoming events |
| GET | `/api/events/:id` | Full detail, tickets, goal progress |
| GET | `/api/categories` | Category filter options |
| GET | `/api/locations` | Location filter options |
| GET | `/api/organization` | Organisation shown on the home page |
| GET | `/api/stats` | Headline numbers for the home page |

Example search:

```
GET /api/events?state=all&city=Lismore&category=1&from=2026-09-01&sort=date&direction=asc
```

Full parameter list, sample responses and status codes:
`docs/api-documentation.md`.

---

## 6. Documentation

| File | Contents |
| --- | --- |
| `docs/PLAN.md` | Requirements extracted from the brief and the task plan |
| `docs/database-design.md` | ERD, table dictionary, design justification |
| `docs/api-documentation.md` | Every endpoint, parameter and response |
| `docs/project-report.md` | Project report - **answer the prompts in your own words** |
| `docs/video-script.md` | Demo video script mapped to the three required questions |
| `docs/video-recording-guide.md` | How to record it on this machine: the tool, the setup, the exact URLs |
| `docs/genai-declaration.md` | The declaration statement to include |
| `docs/submission-checklist.md` | Pre-submission checklist |
| `docs/settings-theme-and-language.md` | The dark theme and the four language switcher |
| `docs/browser-behaviours.md` | Two browser behaviours that look like bugs, and the evidence |

---

## 7. Settings: dark theme and language

The header carries two extra controls, both remembered in `localStorage` so the
choice follows the visitor between pages:

* **Theme** - one button cycling light / dark / follow the system. The palette is
  already made of custom properties, so the dark theme is one block of overrides
  plus the components that were hard coded white. A small inline script applies
  the stored value before the first paint, so a dark user never sees a white
  flash.
* **Language** - English, 中文, Tiếng Việt and 日本語, 236 interface strings each.
  Markup carries `data-i18n` / `data-i18n-attr` attributes and the generated text
  goes through the same `t()` helper, so event cards, filter chips, the progress
  bar and every message follow the switch.

**Scope limit, deliberately:** only the interface is translated. Event names,
descriptions and venues come from the database in English, and a short note in
the header says so while another language is selected. Translating the content
would need translated columns or a translations table - a content management
feature beyond Assessment 2.

These two features are **not required by the brief**; they are additional work on
top of the three required pages. See
`docs/settings-theme-and-language.md` for the design notes, the two helper tools
that keep the dictionaries and the inline theme script honest, and the
assessment caveat about machine-written translations.

Check them with:

```bash
node tools/check-translations.mjs            # four dictionaries, same keys
node tools/sync-theme-snippet.mjs --check    # inline theme script in step
```

---

## 8. Academic integrity

GenAI Level 2 applies to this assessment: brainstorming, grammar, paraphrasing,
formatting and layout templates are permitted; **creating the report or
generating code to copy and paste is not**. Read, understand, modify and be
able to explain every file here, complete the report prompts yourself, and keep
the commits in your GitHub repository your own work.
