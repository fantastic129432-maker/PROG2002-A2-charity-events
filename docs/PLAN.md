# PROG2002 — Assessment 2 (A2) Execution Plan
## Case study: Dynamic charity events website

**Unit:** PROG2002 Web Development II · **Weight:** 40% · **Individual** · **Due:** 28 Sep 2026, 11:59 pm AEST/AEDT
**ULOs assessed:** ULO1 (client/server web technologies), ULO3 (plan, design, develop, deploy a dynamic website)
**Marking split:** Part 1 Database 15% · Part 2 REST API 20% · Part 3 Client-side website 45% · Accuracy/validation 5% · Concept understanding (report, comments, GitHub, video) 15%

---

## 1. What the brief actually asks for (extracted requirements)

### Part 1 — Database (15%)
| # | Requirement |
|---|---|
| 1.1 | Design a schema that manages events, event categories and charitable organisations |
| 1.2 | Create a MySQL database named exactly `charityevents_db` |
| 1.3 | Tables with primary keys and foreign keys defining relationships |
| 1.4 | Sample data: **minimum 8 events** and several categories |
| 1.5 | A Node.js connection file named exactly **`event_db.js`** |
| 1.6 | Export the DB as a `.sql` file the marker can run |

### Part 2 — RESTful API (20%)
| # | Requirement |
|---|---|
| 2.1 | Built with NodeJS + ExpressJS, reading from MySQL |
| 2.2 | Home endpoint → current/upcoming events incl. category |
| 2.3 | Search endpoints → filter by **date, location, category** |
| 2.4 | Categories endpoint → populate the category filter |
| 2.5 | Event details endpoint → full detail for one event |
| 2.6 | RESTful URL design, sensible resources, security considerations |
| 2.7 | No POST/PUT/DELETE required (those come in A3) |

### Part 3 — Client-side website (45%)
| # | Requirement |
|---|---|
| 3.1 | NodeJS, HTML, JavaScript, DOM, Promises only — **no AngularJS** |
| 3.2 | **Home:** hard-coded org info + dynamic event list **via API**; summary points (name, category, location, image); link to details; mark past/upcoming from dates; hide suspended events |
| 3.3 | **Navigation:** menu on **every** page |
| 3.4 | **Search:** filter form with date + location + category, single **or multiple** criteria; "Clear Filters" button using DOM manipulation; calls the API; result list with links; error messages via DOM |
| 3.5 | **Event details:** only the selected event (query string or localStorage for the ID); all details; **goal vs. progress** bar; ticket price (including free); registration form; **Register** button → modal/alert "This feature is currently under construction." |

### Other deliverables
- Project report answering the provided template questions (12 pt Arial, 1.5 line spacing)
- GitHub repository with **regular, well-explained commits** (progress evidence is explicitly graded — "failing to show the correct work progress will cause the assignment to fail")
- Demo video ≤ 15 min covering: architecture, data flow, live demo
- Two zips: `usernameA2-clientside.zip` and `usernameA2-api.zip`
- GenAI declaration statement included

---

## 2. Solution architecture

```
Browser (HTML/CSS/vanilla JS + DOM + fetch/Promises)
        |  HTTP GET (JSON)
        v
Express API  :3000   ->  routes -> controllers -> repository -> MySQL charityevents_db
        ^
        |  optional static hosting of the client build  :5500
```

Key design decisions:

1. **Repository pattern.** `api/src/repositories/repository.mysql.js` holds all SQL; `repository.local.js` implements the same interface from the seed data. `DATA_SOURCE` in `.env` selects which is used. Rationale: MySQL is required and is the default/submission configuration, while the local source lets the whole stack be run and marked on a machine with no MySQL server (and lets me verify it end-to-end here). Same seed data drives both, so behaviour matches.
2. **One shared rule for event state.** `date_start`/`date_end` + `current date` → `upcoming` / `ongoing` / `past`, from `CURDATE()` in SQL and the same rule in JS. `status = 'suspended'` events are excluded from every public endpoint.
3. **RESTful, resource-oriented URLs.** `/api/events`, `/api/events/:id`, `/api/categories`, `/api/locations` with filtering by query string. Parameterised queries only (SQL-injection safety), input validation before hitting SQL, JSON error envelope, 404/400 handling, `helmet`-style headers via a small middleware, and CORS limited to the client origin.
4. **Client is plain browser JS** in ES modules, no framework, one `api.js` wrapper centralising fetch + error handling, and one `dom.js` with the shared render helpers — so DOM manipulation is explicit and easy to demonstrate in the video.
5. **Progress vs goal** is computed from `donations` (SUM) against `events.goal_amount`, satisfying "Goal vs. Progress" with real relational data.

---

## 3. Deliverable file tree (also the two submission zips)

```
charity-events-a2/
├─ README.md
├─ docs/
│  ├─ project-report.md          # answers the project report template
│  ├─ database-design.md         # ERD (Mermaid + ASCII), table dictionary, design rationale
│  ├─ api-documentation.md       # every endpoint, params, sample request/response, status codes
│  ├─ video-script.md            # 15-min demo script mapped to the 3 required questions
│  ├─ genai-declaration.md       # Statement A/B wording
│  └─ submission-checklist.md    # final pre-submit checklist
├─ database/
│  ├─ charityevents_db.sql       # full dump: create DB + tables + seed (marker runs this)
│  ├─ 01_schema.sql
│  └─ 02_seed.sql
├─ api/                          # -> usernameA2-api.zip
│  ├─ package.json
│  ├─ .env.example
│  ├─ server.js
│  └─ src/
│     ├─ config/env.js
│     ├─ db/event_db.js          # REQUIRED filename: MySQL connection
│     ├─ repositories/repository.mysql.js
│     ├─ repositories/repository.local.js
│     ├─ repositories/index.js
│     ├─ services/eventService.js
│     ├─ controllers/eventController.js
│     ├─ controllers/categoryController.js
│     ├─ routes/apiRoutes.js
│     ├─ middleware/validate.js
│     ├─ middleware/errorHandler.js
│     ├─ middleware/notFound.js
│     └─ utils/asyncHandler.js
├─ tests/
│  ├─ run-tests.js               # node:test suite for all endpoints
│  └─ smoke.md
└─ clientside/                   # -> usernameA2-clientside.zip
   ├─ index.html                 # Home
   ├─ search.html                # Search events
   ├─ event.html                 # Event details
   ├─ css/styles.css
   ├─ js/config.js               # API base URL
   ├─ js/api.js                  # fetch wrappers (Promises)
   ├─ js/dom.js                  # DOM helpers / renderers
   ├─ js/nav.js                  # shared menu on every page
   ├─ js/home.js
   ├─ js/search.js
   ├─ js/event.js
   ├─ js/modal.js
   └─ images/*.svg               # offline image/icon assets
```

---

## 4. Step-by-step task list

| Step | Work | Rubric link |
|---|---|---|
| 1 | Scaffold repo, `README.md`, folder structure | Concept |
| 2 | Write `database/01_schema.sql` — 7 tables, PK/FK, indexes, generated `raised_amount` | P1 15% |
| 3 | Write `database/02_seed.sql` — 6 orgs, 8 categories, **10 events** (past + upcoming + 1 suspended), ticket types, 40+ donations | P1 15% |
| 4 | Build `charityevents_db.sql` dump + ERD/dictionary in `docs/database-design.md` | P1 15% |
| 5 | `api/src/db/event_db.js` — MySQL pool, `query()` helper, graceful failure | P1 15% |
| 6 | Both repositories + shared event-state mapping | P1/P2 |
| 7 | Express app: env, routes, controllers, validation, error handling, security headers, CORS | P2 20% |
| 8 | `docs/api-documentation.md` with real sample responses | P2 20% |
| 9 | Client shell: `styles.css`, `nav.js`, `config.js`, `api.js`, `dom.js` | P3 45% |
| 10 | Home page: static org content + dynamic API-driven upcoming events | P3 45% |
| 11 | Search page: 3-criteria multi-select form, Clear Filters, API call, error messages | P3 45% |
| 12 | Event detail page: query-string ID, full detail, tickets, goal vs progress, register modal | P3 45% |
| 13 | Run API + client locally, test all endpoints and all three pages, fix defects | Accuracy 5% |
| 14 | `tests/run-tests.js` endpoint suite (search filters, validation, 404s) | Accuracy 5% |
| 15 | Project report, video script, GenAI declaration, submission checklist | Concept 15% |
| 16 | Build the two submission zips, verify contents | Deliverables |

---

## 5. GenAI boundary (i.e., what you must still do yourself)

The brief permits GenAI Level 2 only for brainstorming, grammar, paraphrasing/editing, document formatting and layout templates. It explicitly forbids using GenAI to *create the report* or to *generate code that you copy-paste*.

Consequences for this plan, which I will follow:

- Everything I produce is a **reference implementation and scaffold you must read, understand, modify and be able to explain** — you own the final code, comments and wording.
- The report file is a **structure/template with prompts and your own answers to fill in**; I will not write the report prose for you.
- You must re-type/adapt code rather than pasting it verbatim, add your own comments, and be able to defend every line in the demo video and possible interview.
- Include the GenAI declaration (Statement A) and be ready to describe exactly what you used GenAI for.

---

## 6. Assumptions

1. **Student username placeholder:** `username` (used in zip filenames) — replace with your SCU username.
2. **Organisation/event content is fictional** — invented charity brand, venues and events; no real organisation is endorsed.
3. **"Today" is dynamic.** Seed data uses fixed 2026 dates chosen around the 28 Sep 2026 due date so the Home page shows a realistic mix of upcoming and past events whenever the marker runs it.
4. **MySQL 8.x** target (uses `CHECK`, `GENERATED` columns, `utf8mb4`). `event_db.js` also works on 5.7 if the generated column is replaced.
5. Local verification runs with `DATA_SOURCE=local` because no MySQL server is installed on this machine; the submitted default is `mysql`.
