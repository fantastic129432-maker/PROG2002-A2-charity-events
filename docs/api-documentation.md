# API documentation - Charity Events API

PROG2002 Web Development II - Assessment 2, Part 2 (20%)

Base URL: `http://localhost:3000/api`

---

## 1. Conventions

### Response envelope
Every successful response uses the same shape, so the client needs one code
path:

```json
{
  "success": true,
  "meta": {
    "resource": "events",
    "dataSource": "mysql",
    "total": 8,
    "count": 8,
    "page": 1,
    "totalPages": 1,
    "limit": 20,
    "offset": 0,
    "appliedFilters": { "state": "upcoming" },
    "generatedAt": "2026-09-28T02:15:31.220Z"
  },
  "data": [ ]
}
```

### Error envelope
Every failure uses the same shape, including the field that caused it:

```json
{
  "success": false,
  "error": {
    "status": 400,
    "message": "One or more query parameters are invalid.",
    "details": [
      { "field": "to", "message": "The end of the range cannot be earlier than the start." }
    ]
  }
}
```

### Status codes used

| Code | Meaning in this API |
| --- | --- |
| 200 | Success |
| 400 | A query parameter was invalid (bad date, unknown sort, id not a number) |
| 404 | The endpoint or the event does not exist, or the event is suspended |
| 429 | Rate limit exceeded |
| 500 | Unexpected server fault (details logged, not returned) |
| 503 | `/api/health` only: the API runs but the database is unreachable |

### Cross-cutting behaviour

| Concern | Implementation |
| --- | --- |
| SQL injection | Every value is bound with a `?` placeholder through `mysql2`; the sort column is chosen from a whitelist |
| Input validation | `eventService.buildQuery()` validates and normalises before any SQL runs |
| Hidden records | All public queries read `vw_public_events`, which enforces `status = 'active'` |
| Pagination | `?limit=` (max 100) and `?offset=` or `?page=` |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; `X-Powered-By` removed |
| CORS | Origins listed in `CORS_ORIGIN`; `*` only for local marking |
| Rate limiting | Fixed window per client IP (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS`) |
| Read-only | Only `GET` is implemented in Assessment 2; `POST`/`PUT`/`DELETE` arrive in Assessment 3 |

---

## 2. `/api/health`

Confirms the API is running and whether the database answers. Also useful as
the first step of the demo video.

**Request** `GET /api/health`

**Response 200**

```json
{
  "success": true,
  "meta": { "resource": "health", "dataSource": "mysql", "environment": "development", "uptimeSeconds": 42 },
  "data": {
    "api": "ok",
    "database": {
      "connected": true,
      "database": "charityevents_db",
      "serverVersion": "8.0.36",
      "tableCount": 8,
      "host": "localhost:3306",
      "user": "root"
    }
  }
}
```

If MySQL is not reachable the status becomes **503** and `database` contains an
`error` object plus a `hint` explaining how to fix it.

---

## 3. `/api` - API index

**Request** `GET /api`

Returns the name, version and a list of every endpoint with its description and
query parameters. This doubles as living documentation during the demo.

---

## 4. `/api/events` - the main resource

This one endpoint serves **both** the home page and the search page.

**Request** `GET /api/events`

### Query parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `category` | id, repeatable or comma separated | - | Filter by one or more category ids, e.g. `?category=1,2` or `?category=1&category=2` |
| `location` | id, repeatable or comma separated | - | Filter by one or more location ids |
| `city` | text | - | Partial, case-insensitive city match |
| `date` | `YYYY-MM-DD` | - | Events running on that single day |
| `from` | `YYYY-MM-DD` | - | Events ending on or after this date |
| `to` | `YYYY-MM-DD` | - | Events starting on or before this date |
| `state` | `upcoming` \| `ongoing` \| `past` \| `all` | `upcoming` | Derived from the dates. `upcoming` means "has not finished yet", so it includes an event running today |
| `keyword` | text | - | Matches event name, short description, city, venue or organisation |
| `isFree` | `true` \| `false` | - | Only free events, or only paid events |
| `organizationId` | id | - | Restrict to one organisation |
| `includePast` | `true` \| `false` | `false` | Convenience alias for `state=all` |
| `sort` | `date` \| `name` \| `goal` \| `progress` \| `category` \| `city` | `date` | Whitelisted sort keys only |
| `direction` | `asc` \| `desc` | `asc` | Sort direction |
| `limit` | 1-100 | 20 | Page size |
| `offset` | >= 0 | 0 | Rows to skip |
| `page` | >= 1 | 1 | Alternative to `offset` |

### Example - the home page (current and upcoming only)

```
GET /api/events?state=upcoming&sort=date&direction=asc&limit=12
```

```json
{
  "success": true,
  "meta": { "total": 8, "count": 8, "page": 1, "totalPages": 1, "appliedFilters": { "state": "upcoming" } },
  "data": [
    {
      "eventId": 4,
      "eventName": "Paws and Pints Charity Concert",
      "shortDescription": "Four local bands, food trucks and a dog-friendly lawn.",
      "eventDate": "2026-10-03",
      "startTime": "13:00:00",
      "endTime": "19:00:00",
      "dateStart": "2026-10-03",
      "dateEnd": "2026-10-03",
      "eventState": "upcoming",
      "categoryId": 4,
      "categoryName": "Charity Concert",
      "categorySlug": "charity-concert",
      "organizationId": 4,
      "organizationName": "Northern Rivers Animal Rescue",
      "locationId": 4,
      "venueName": "Ballina Beach Reserve",
      "city": "Ballina",
      "state": "NSW",
      "postcode": "2478",
      "goalAmount": 18000,
      "raisedAmount": 7025,
      "progressPercent": 39,
      "donationCount": 4,
      "isFree": false,
      "primaryPrice": 15,
      "capacity": 800,
      "imageUrl": "charity-concert.svg"
    }
  ]
}
```

### Example - the search page (three criteria at once)

```
GET /api/events?state=all&city=Lismore&category=1&from=2026-01-01&to=2026-12-31
```

```json
{
  "success": true,
  "meta": {
    "total": 1,
    "appliedFilters": { "categoryIds": [1], "city": "Lismore", "from": "2026-01-01", "to": "2026-12-31", "state": "all" }
  },
  "data": [ { "eventId": 1, "eventName": "Riverside Rainbow Fun Run 2026", "eventState": "upcoming" } ]
}
```

### Example - past events

```
GET /api/events?state=past&sort=date&direction=desc
```

Returns the two completed events, with `eventState: "past"`.

### Example - validation failure

```
GET /api/events?from=2026-12-01&to=2026-01-01
```

```json
{
  "success": false,
  "error": {
    "status": 400,
    "message": "One or more query parameters are invalid.",
    "details": [ { "field": "to", "message": "The end of the range cannot be earlier than the start." } ]
  }
}
```

---

## 5. `/api/events/upcoming`

The home page listing, in one call.

**Request** `GET /api/events/upcoming?limit=12&sort=date&direction=asc`

Identical to `GET /api/events?state=upcoming`, with a `meta.view` of
`"upcoming"`. It exists because it makes the home page's intent explicit and
gives the client a short, readable URL.

---

## 6. `/api/events/:id` - full detail

**Request** `GET /api/events/1`

Returns everything the event detail page needs, including the ticket tiers and
the goal/progress figures.

```json
{
  "success": true,
  "meta": { "resource": "event" },
  "data": {
    "eventId": 1,
    "eventName": "Riverside Rainbow Fun Run 2026",
    "shortDescription": "A 5 km and 10 km family fun run along the Wilsons River.",
    "description": "The Riverside Rainbow Fun Run is Unity Heart Foundations flagship community event...",
    "purpose": "Fund free paediatric allied health sessions for local families.",
    "eventDate": "2026-10-11",
    "startTime": "07:30:00",
    "endTime": "12:00:00",
    "dateStart": "2026-10-11",
    "dateEnd": "2026-10-11",
    "eventState": "upcoming",
    "daysUntil": 13,
    "organizationName": "Unity Heart Foundation",
    "categoryName": "Fun Run",
    "venueName": "Lismore Riverside Park",
    "address": "2 Riverside Dr",
    "city": "Lismore",
    "state": "NSW",
    "postcode": "2480",
    "capacity": 1200,
    "isFree": false,
    "goalAmount": 25000,
    "raisedAmount": 7720,
    "progressPercent": 30.9,
    "donationCount": 7,
    "primaryPrice": 0,
    "imageUrl": "fun-run.svg",
    "ticketTypes": [
      { "ticketTypeId": 3, "ticketName": "Free Community Entry", "price": 0, "quantityAvailable": 100, "description": "Free entry for concession card holders" },
      { "ticketTypeId": 2, "ticketName": "5 km Family Walk", "price": 25, "quantityAvailable": 500, "description": "Untimed walk entry, children under 12 free" },
      { "ticketTypeId": 1, "ticketName": "10 km Timed Run", "price": 45, "quantityAvailable": 600, "description": "Chip-timed entry with medal and breakfast voucher" }
    ]
  }
}
```

### Errors

| Request | Status | Message |
| --- | --- | --- |
| `GET /api/events/abc` | 400 | `"abc" is not a valid event id. Event ids are positive whole numbers.` |
| `GET /api/events/9999` | 404 | `No active charity event was found with id 9999. It may have been suspended or removed.` |
| `GET /api/events/11` (suspended) | 404 | Same as above - a suspended event is not disclosed |

---

## 7. `/api/categories`

Drives the category checkboxes on the search page.

**Request** `GET /api/categories`

```json
{
  "success": true,
  "meta": { "resource": "categories", "count": 8 },
  "data": [
    { "categoryId": 1, "categoryName": "Fun Run", "slug": "fun-run", "description": "Walk, jog or run to raise funds", "icon": "run", "eventCount": 2 },
    { "categoryId": 2, "categoryName": "Gala Dinner", "slug": "gala-dinner", "description": "Formal evening of dining, speakers and auctions", "icon": "gala", "eventCount": 2 }
  ]
}
```

`eventCount` counts only **active** events, so a category whose only event is
suspended shows `0`.

---

## 8. `/api/locations`

Drives the location suggestions on the search page.

**Request** `GET /api/locations`

```json
{
  "success": true,
  "meta": { "resource": "locations", "count": 8 },
  "data": [
    { "locationId": 1, "venueName": "Lismore Riverside Park", "city": "Lismore", "state": "NSW", "eventCount": 1 },
    { "locationId": 5, "venueName": "Sydney Town Hall", "city": "Sydney", "state": "NSW", "eventCount": 2 }
  ]
}
```

Only venues that currently host at least one active event are returned.

---

## 9. `/api/organization` and `/api/stats`

Supporting endpoints for the home page.

**`GET /api/organization`**

```json
{
  "success": true,
  "data": {
    "organizationId": 1,
    "name": "Unity Heart Foundation",
    "mission": "We fund community health programs for families who cannot afford private care.",
    "email": "hello@unityheart.org.au",
    "phone": "(02) 6620 1001",
    "website": "https://unityheart.org.au",
    "city": "Lismore",
    "country": "Australia"
  }
}
```

**`GET /api/stats`**

```json
{
  "success": true,
  "data": {
    "upcomingEvents": 8,
    "categories": 8,
    "organizations": 6,
    "totalRaised": 99290,
    "activeGoal": 240000,
    "defaultPageSize": 20
  }
}
```

---

## 10. Testing the API

### Browser
Open <http://localhost:3000/> for a clickable index, or
<http://localhost:3000/api/events?state=all> for raw JSON.

### Postman
1. Create a collection called `PROG2002 A2 - Charity Events API`.
2. Add a request for each endpoint above and save them.
3. Suggested folder: `Events`, `Reference data`, `Health`.
4. To demonstrate the search filter, use
   `{{baseUrl}}/events?state=all&city=Lismore&category=1`.
5. Add a test script to the search request:

```javascript
pm.test('status is 200', () => pm.response.to.have.status(200));
pm.test('envelope is successful', () => pm.expect(pm.response.json().success).to.be.true);
pm.test('every event is in the requested category', () => {
  pm.response.json().data.forEach((event) => pm.expect(event.categoryId).to.eql(1));
});
```

### Automated suite
```bash
node tests/run-tests.js
```
runs 30 HTTP checks (plus 16 DOM checks) covering every endpoint, every filter
combination, and each error case documented above.

---

## 11. What comes next (Assessment 3)

These endpoints are intentionally absent, because the brief states that
`POST`, `PUT` and `DELETE` are developed in Assessment 3:

* `POST /api/registrations` - register and pay for tickets
* `POST /api/donations` - add a donation
* `POST/PUT/DELETE /api/events` - admin management of events
* `PUT /api/events/:id/status` - suspend or restore an event

The database already supports them: `ticket_types` and `donations` have their
INSERT structure in place, and `events.status` already has a `suspended` value
that the website honours.
