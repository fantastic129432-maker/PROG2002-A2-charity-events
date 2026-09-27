# Demo video script (maximum 15 minutes)

PROG2002 Web Development II - Assessment 2

The brief requires the video to answer **three questions**. The timings below
add up to about 13 minutes, which leaves room for pauses and load times.

---

## Before you record - checklist

Mechanics are in `video-recording-guide.md` (OBS setup, exact URLs,
troubleshooting). The short version:

- [ ] MySQL is running and `charityevents_db` exists (`SELECT COUNT(*) FROM events;` returns 11)
- [ ] API is running: `cd api && npm start`
- [ ] Client is running: `cd clientside && node serve-clientside.js`
- [ ] **OBS Studio** open on the `Demo` scene, and the microphone bar moves when you talk
- [ ] Browser tabs open in this order:
  1. `http://localhost:5500/index.html` (home)
  2. `http://localhost:5500/search.html` (search)
  3. `http://localhost:3000/api/events?state=all&limit=3` (raw JSON)
- [ ] **MySQL Workbench** connected to `charityevents_db`, SCHEMAS expanded so Tables and Views are both visible
- [ ] **Postman** with the collection imported: `docs/postman/PROG2002-A2-Charity-Events-API.postman_collection.json`
- [ ] VS Code open on the project: `api/src/db/event_db.js`, `api/src/repositories/repository.mysql.js`, `clientside/js/search.js`
- [ ] Notifications off (`Win`+`A` > Do not disturb), other applications closed
- [ ] Browser zoom 110-125%, bookmarks bar hidden
- [ ] Have your GitHub repository open in one tab to show the commit history
- [ ] Speak slowly, and state your name and student number at the start

**Practice once without recording.** The most common reason for losing marks is
running out of time while explaining the wrong thing - the three required
questions matter more than the visual tour.

---

## 0:00 - 0:40 | Introduction

> "Hello, my name is _[name]_, student number _[number]_. This is my
> Assessment 2 submission for PROG2002 Web Development II.

> I have built a dynamic charity events website with three parts: a MySQL
> database called `charityevents_db`, a RESTful API built with NodeJS and
> Express, and a client-side website built with HTML, JavaScript and the DOM.

> The site lets the public see upcoming charity events, search them by date,
> location and category, and open an event to see the full details, the ticket
> prices and how close the fundraising is to its goal."

---

## 0:40 - 5:00 | Question 1: Database and API architecture (ULO3: Plan and design)

### 0:40 - 2:00 | The database schema

**Show:** MySQL Workbench with `charityevents_db` expanded in the SCHEMAS panel,
showing both **Tables** and **Views**. Point out that the two views are where the
rules live. Then `database/01_schema.sql` in VS Code.

> "I designed six tables. `organizations`, `categories` and `locations` are the
> lookup tables, `events` is the main resource, and `ticket_types` and
> `donations` hang off an event.

> `events` has three foreign keys: one organisation, one category and one
> location. That gives the relationships the brief asks for: one organisation
> hosts many events, and each event belongs to exactly one category.

> Two design decisions I want to explain. First, the event state is not stored.
> The view `vw_public_events` compares `date_start` and `date_end` with
> `CURDATE()` and returns `past`, `ongoing` or `upcoming`. Because it is
> calculated, the website is always correct without a scheduled job.

> Second, suspending an event. The `status` column can be `active` or
> `suspended`, and the view has `WHERE status = 'active'`. Every public
> endpoint reads that view, so a suspended event cannot leak out through any
> endpoint. Let me prove it..."

**Do:** in Workbench, open a new SQL tab and run (the blue **Run** button, top
right):

```sql
USE charityevents_db;

-- eleven rows exist in the table
SELECT COUNT(*) AS in_table FROM events;

-- but the public view exposes only ten
SELECT COUNT(*) AS in_view FROM vw_public_events;

-- and this is the one that is hidden
SELECT event_id, event_name, status FROM events WHERE status <> 'active';
```

> "Eleven events exist in the table, but only ten are public - the suspended one
> is invisible to the website. That rule is enforced by the view, not by the
> page, so it holds for every endpoint at once."

### 2:00 - 3:00 | The Node connection file and the API structure

**Show:** `api/src/db/event_db.js`.

> "`event_db.js` connects Node to MySQL. I use a connection pool rather than a
> single connection, so concurrent requests do not queue behind each other and
> a dropped connection is replaced automatically. The pool is created lazily,
> and it exposes a small `query` helper that always uses parameterised
> statements, which is what prevents SQL injection."

**Show:** `api/src/routes/apiRoutes.js`.

> "My API follows a layered structure: routes decide the URL, controllers deal
> with HTTP, services validate the query, repositories hold the SQL, and
> `event_db.js` talks to MySQL.

> My endpoints are `/api/events` for the home and search pages,
> `/api/events/upcoming`, `/api/events/:id` for the detail page,
> `/api/categories` and `/api/locations` for the search filters, plus
> `/api/stats` and `/api/health`."

### 3:00 - 4:10 | Demo and test a key endpoint in Postman

**Show:** Postman, collection **PROG2002 A2 - Charity Events API**, folder
**Search page**, request **`GET /events` (three criteria at once)**. Press
**Send** and point out the status `200 OK`, the response time, then the envelope.

> "This is my search endpoint, which is the most complex one. I am filtering by
> three criteria at once: the city Lismore, category one, which is Fun Run, and
> a date range.

> The response has a `meta` object with the total and the filters that were
> actually applied, and a `data` array with the matching events. Only the
> Riverside Rainbow Fun Run matches, which is correct.

> Postman also runs the assertions I saved with the request, in the Test Results
> tab - they check the total, the applied filters and the progress figures."

**Do:** switch to the folder **Validation and error handling**, request
**`GET /events` (invalid date range) -> 400**, and press **Send**.

> "The API rejects a backwards date range with a 400, and the `details` array
> names the field that was wrong - that is what lets the search page show a
> message beside the form. The same rules are enforced in the browser for a
> better experience, but the server never trusts the client."

**Do:** send **`GET /events/11` (suspended event) -> 404** from the same folder.

> "This event exists in the database but its status is suspended, and the public
> API answers as though it does not exist. The rule is in the database view, so
> it applies to every endpoint.

> One more, because it is the security point: the sort parameter is chosen from a
> fixed list rather than pasted into the SQL."

**Do:** send **`GET /events` (unknown sort key) -> 400**, which contains
`?sort=date;DROP TABLE events`.

> "An injection attempt is rejected before any query runs. You can see in the
> tests that the events table is still there afterwards."

### 4:10 - 5:00 | The SQL behind the search

**Show:** `api/src/repositories/repository.mysql.js`, the `buildEventFilter`
and `findEvents` functions.

> "Each filter adds one condition to an array and pushes its values into a
> parameters array. Nothing is concatenated into the SQL text, so the query is
> safe. The sort column comes from a whitelist object rather than straight from
> the query string.

> For paging I wrap the filtered query in a derived table, then select the page
> and count the total from the same subquery, so the count can never disagree
> with the page."

---

## 5:00 - 8:30 | Question 2: Data flow and interaction between the API and the website (ULO1 and ULO3)

**Show:** split screen - `clientside/js/search.js` and the browser with DevTools
open on the **Network** tab.

> "This question is about how a click in the browser becomes data on the screen.
> I will follow one search from start to finish."

### 5:00 - 6:00 | Step 1: reading the form

**Show:** `search.js`, the `collectFilters()` function.

> "When the form is submitted, `collectFilters()` reads every control: the two
> date inputs, the city text field, the keyword field, the free checkbox, the
> include-past checkbox, and every checked category checkbox. It returns an
> object of query parameters. Categories are collected as an array, so one or
> many categories can be sent."

### 6:00 - 6:40 | Step 2: building the request

**Show:** `js/api.js`, `buildQueryString()` and `getJson()`.

> "`api.js` is the only place in the client that talks to the server.
> `getJson()` builds the full URL, adds an `Accept: application/json` header,
> and attaches an `AbortController` so a slow request is cancelled after ten
> seconds instead of hanging the page.

> `fetch()` returns a Promise. I use `await`, which is the same Promise with
> more readable syntax."

### 6:40 - 7:30 | Step 3: receiving and checking the response

**Show:** the browser Network tab: click the `events` request, show the JSON.

> "Here is the actual request in the Network tab, and here is the JSON that
> came back. Back in `getJson()` I check `response.ok` and I also check the
> API's own `success` flag. If either is false, I throw an `ApiError` that
> carries the status code and the details array from the server. That means one
> `catch` block in the page can handle every kind of failure - a 400 from a bad
> filter, a 404 for a missing event, or the server being offline."

### 7:30 - 8:30 | Step 4: turning data into HTML

**Show:** `js/dom.js`, the `eventCard()` function, then the page.

> "Finally `dom.js` builds the DOM. For each event object it creates an
> `<article>`, an `<img>`, a heading with a link to `event.html?id=` plus the
> event id, a category chip, a price pill, the date and venue list, and a
> progress bar whose width is the percentage the API calculated.

> Notice I use `createElement` and `textContent` rather than pasting HTML, and
> anything that does come from the database is escaped - so an event name
> cannot inject markup into the page.

> The same function renders the home page and the search results, which is why
> a card looks identical in both places."

**Do:** switch to the browser, click a card, and point at the URL.

> "When I click a card, the event id travels in the query string, and the detail
> page uses that id to fetch that one event."

---

## 8:30 - 12:30 | Question 3: Website functionality demo (ULO3: complete dynamic website)

### 8:30 - 9:30 | Home page

**Show:** `http://localhost:5500/index.html`.

> "The home page has two kinds of content. The welcome message, the mission
> statement and the contact details are static, as the brief allows. The event
> listing underneath is entirely dynamic - it comes from
> `GET /api/events/upcoming`.

> Each card shows the event name, the category, the date and time, the venue and
> city, the organisation, the price, and a live progress bar. Only events that
> have not finished are listed, and the suspended event is not here.

> If I change the sort dropdown, the page re-queries the API without reloading."

### 9:30 - 11:00 | Search page - the main demonstration

**Show:** `search.html`.

> "This is the search page. I have three criteria, matching the brief: date,
> location and category.

> For the date I use two date inputs, so a range is possible. For location I use
> a text field with suggestions built from `GET /api/locations`, which means the
> visitor cannot easily type a city that does not exist. For categories I use
> checkboxes, because more than one category can apply.

> Let me demonstrate. First, only a location."

**Do:** type Lismore, click **Search events**. Point out the result count, the
active filter chips and the network request.

> "One result, and a removable chip appeared showing the active filter. The
> chips are created with DOM manipulation, and clicking the cross removes that
> one filter and re-runs the search.

> Now let me combine criteria."

**Do:** additionally tick **Fun Run** and set **From** 2026-10-01.

> "Still one result, and the URL at the top now contains all the filters, so I
> could share this exact search as a link.

> Now an empty result."

**Do:** change the city to `Melbourne`, search.

> "Instead of a blank page, the page shows an empty state with a suggestion of
> what to change. That state is also built with DOM methods.

> Finally, validation."

**Do:** set From `2026-12-01` and To `2026-01-01`, search.

> "The page refuses to send the request and tells me why. That is client-side
> validation. The API rejects the same input as well, which is the important
> part.

> And this is the **Clear Filters** button."

**Do:** click **Clear Filters**.

> "Every checkbox is unticked, every text field is emptied, the chips are
> removed, the result count is reset and the panel returns to its starting
> state - all with basic DOM manipulation, as the brief requires."

### 11:00 - 12:30 | Event detail page and the Register button

**Show:** click a result, then `event.html?id=1`.

> "The detail page receives the id in the query string, fetches that single
> event, and displays only that event - there is no list on this page.

> It shows the full description, the purpose of the fundraising, the date,
> times, venue, capacity and the organisation running it.

> Ticket information lists every price tier, including the free tier for
> concession card holders, which the brief specifically asks for.

> Goal versus progress is calculated from the donations table: seven thousand
> seven hundred and twenty dollars raised of a twenty five thousand dollar
> goal, which is about thirty one percent.

> And the Register button..."

**Do:** click **Register**.

> "...opens a modal that says 'This feature is currently under construction.',
> exactly as the brief requires. I used a real modal rather than an alert
> because it fits the design, and it handles Escape, the backdrop, focus
> trapping and returning focus to the button.

> The registration form below validates the name, the email and the ticket
> quantity in the browser before showing the same dialog."

---

## 12:30 - 13:30 | Work progress, testing and closing

**Show:** your GitHub repository commit history.

> "I committed regularly with descriptive messages, so the history shows how the
> project was built: the database first, then the API, then the client, with
> fixes in between."

**Show:** a terminal running `node tests/run-tests.js`.

> "I also wrote an automated test suite. It starts its own API instance and runs
> forty-six checks: every endpoint, every search filter, the validation and
> error cases, and DOM tests that load the real pages and confirm the data
> reaches the page.

> All forty-six pass."

> "To summarise: the database, the API and the client-side website are complete,
> the website is fully driven by the API, and the suspended event and past
> events are handled exactly as the brief requires. Thank you for watching."

**Stop recording.**

---

## After recording

- [ ] Watch it back with the sound on and check the three question headings are clearly answered
- [ ] Confirm the total length is under 15 minutes
- [ ] Confirm the required sentence "This feature is currently under construction." is audible
- [ ] Upload to SCU OneDrive, set the sharing so your marker can view it, and test the link in a private browser window
- [ ] Put the shareable link in your submission

## Likely interview questions - be ready for these

1. Why did you use a view for the public events instead of a stored status column?
2. How exactly does your search avoid SQL injection?
3. Why is `limit` capped at 100?
4. What happens if the API is offline when the home page loads?
5. How does the event id get from the home page to the detail page?
6. How would you add event registration in Assessment 3?
7. Which parts of the client code would you change to add a new filter?
