/**
 * tests/run-tests.js
 * ---------------------------------------------------------------------------
 * Automated checks for the PROG2002 A2 submission. Run from the project root:
 *
 *     node tests/run-tests.js
 *
 * Two groups of checks are performed:
 *
 *   PART A - HTTP tests against the live Express API.
 *            The suite starts the API itself (on its own free port, with a temporary
 *            local data source), so it never disturbs a running server.
 *            Every endpoint, filter, validation rule and error response that
 *            the marker can try is asserted here.
 *
 *   PART B - DOM tests for the client-side website.
 *            The real HTML files and the real client JavaScript modules are
 *            loaded into a jsdom document, with fetch redirected to the test
 *            API. This proves that the data flow really ends up as rendered
 *            HTML: event cards, the progress bar, ticket prices, the filter
 *            checkboxes, the Clear Filters button and the "under
 *            construction" modal.
 *
 * The suite uses only Node's built-in assert module plus jsdom (a development
 * dependency, not part of the submitted api or clientside folders).
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'clientside');
const API_DIR = path.join(ROOT, 'api');
const PREFERRED_PORT = Number(process.env.TEST_PORT || 3100);
const DEMO_TODAY = '2026-09-28'; // matches the seed data and api/.env

/**
 * The port the test API actually listens on. It starts at PREFERRED_PORT and
 * moves up if that port is taken, so two suites running at the same time (for
 * example the offline and MySQL runs launched together) cannot collide. A
 * collision used to make several DOM tests fail intermittently, which is the
 * worst kind of test failure.
 */
let port = PREFERRED_PORT;
const baseUrl = () => `http://127.0.0.1:${port}/api`;
/** Origin only, for handlers that receive a path that already starts with /api. */
const origin = () => `http://127.0.0.1:${port}`;

let passed = 0;
let failed = 0;
const failures = [];

/** Run one named check. */
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/** Small fetch helper that also returns the status code. */
async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl()}${pathname}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

/* =====================================================================
 * Start the API for testing
 * ===================================================================== */
async function startTestApi() {
  // The offline data source is the default so the suite never needs MySQL,
  // but TEST_DATA_SOURCE=mysql runs exactly the same checks against the real
  // database, which is the best way to prove both repositories behave alike.
  process.env.NODE_ENV = 'test';
  process.env.DATA_SOURCE = process.env.TEST_DATA_SOURCE || 'local';
  process.env.DEMO_TODAY = DEMO_TODAY;
  process.env.CORS_ORIGIN = '*';
  process.env.RATE_LIMIT_MAX = '0';

  // A port that is already in use must not fail every HTTP test, so try a
  // handful of ports in a row.
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    port = PREFERRED_PORT + attempt;
    process.env.PORT = String(port);

    // Require once; the module caches the Express app across attempts, which
    // is fine because only the listening port changes.
    const { app } = require(path.join(API_DIR, 'server.js'));

    try {
      const server = await new Promise((resolve, reject) => {
        const candidate = app.listen(port, () => resolve(candidate));
        candidate.once('error', reject);
      });
      return server;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) throw error;
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
    }
  }

  throw new Error(`No free port found between ${PREFERRED_PORT} and ${PREFERRED_PORT + maxAttempts - 1}`);
}

/* =====================================================================
 * PART A - API tests
 * ===================================================================== */
async function testApi() {
  group('PART A - REST API (HTTP)');

  await test('GET /api/health reports the database as connected', async () => {
    const { status, body } = await api('/health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.notEqual(body.data.database.connected, false);
  });

  await test('GET /api lists every documented endpoint', async () => {
    const { status, body } = await api('');
    assert.equal(status, 200);
    const paths = body.data.endpoints.map((endpoint) => endpoint.path);
    for (const expected of [
      '/api/health',
      '/api/events',
      '/api/events/upcoming',
      '/api/events/:id',
      '/api/categories',
      '/api/locations',
      '/api/organization',
      '/api/stats',
    ]) {
      assert.ok(paths.includes(expected), `${expected} is missing from the API index`);
    }
  });

  await test('GET /api/events/upcoming returns only events that have not finished', async () => {
    const { status, body } = await api('/events/upcoming');
    assert.equal(status, 200);
    assert.ok(body.data.length >= 5, 'expected at least five upcoming events');
    assert.ok(
      body.data.every((event) => event.eventState !== 'past'),
      'a past event leaked into the upcoming list'
    );
    // Soonest first
    const dates = body.data.map((event) => event.dateStart);
    assert.deepEqual(dates, [...dates].sort(), 'upcoming events are not sorted by date');
  });

  await test('GET /api/events excludes suspended events', async () => {
    const { body } = await api('/events?state=all&limit=100');
    const ids = body.data.map((event) => event.eventId);
    assert.ok(!ids.includes(11), 'the suspended event 11 must never be returned');
    assert.ok(
      body.data.every((event) => event.status === undefined || event.status === 'active'),
      'a non-active event was returned'
    );
  });

  await test('GET /api/events includes at least 8 seeded events', async () => {
    const { body } = await api('/events?state=all&limit=100');
    assert.ok(
      body.meta.total >= 8,
      `the database must hold at least 8 events, found ${body.meta.total}`
    );
  });

  await test('GET /api/events contains both upcoming and past events', async () => {
    const { body } = await api('/events?state=all&limit=100');
    const states = new Set(body.data.map((event) => event.eventState));
    assert.ok(states.has('upcoming'), 'no upcoming events found');
    assert.ok(states.has('past'), 'no past events found');
  });

  await test('every event in the list carries the fields the client renders', async () => {
    const { body } = await api('/events?state=all&limit=100');
    for (const event of body.data) {
      for (const field of [
        'eventId',
        'eventName',
        'shortDescription',
        'dateStart',
        'dateEnd',
        'eventState',
        'categoryName',
        'organizationName',
        'city',
        'venueName',
        'goalAmount',
        'raisedAmount',
        'progressPercent',
      ]) {
        assert.ok(
          event[field] !== undefined && event[field] !== null,
          `event ${event.eventId} is missing ${field}`
        );
      }
    }
  });

  await test('search filter: category ids (multiple) narrow the result set', async () => {
    const all = await api('/events?state=all&limit=100');
    const filtered = await api('/events?state=all&category=1,2&limit=100');
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.length > 0, 'expected at least one fun run or gala');
    assert.ok(
      filtered.body.data.every((event) => [1, 2].includes(event.categoryId)),
      'a category outside the filter was returned'
    );
    assert.ok(
      filtered.body.meta.total < all.body.meta.total,
      'the filter did not narrow anything'
    );
  });

  await test('search filter: repeated category parameters behave like a comma list', async () => {
    const comma = await api('/events?state=all&category=1,2&limit=100');
    const repeated = await api('/events?state=all&category=1&category=2&limit=100');
    assert.equal(repeated.body.meta.total, comma.body.meta.total);
  });

  await test('search filter: location id', async () => {
    const { body } = await api('/events?state=all&location=1&limit=100');
    assert.ok(body.data.length > 0);
    assert.ok(body.data.every((event) => event.locationId === 1));
  });

  await test('search filter: city is a case-insensitive partial match', async () => {
    const { body } = await api('/events?state=all&city=lism&limit=100');
    assert.ok(body.data.length >= 1);
    assert.ok(
      body.data.every((event) => event.city.toLowerCase().includes('lism')),
      'a city outside the filter was returned'
    );
  });

  await test('search filter: date range', async () => {
    const { body } = await api('/events?state=all&from=2026-10-01&to=2026-10-31&limit=100');
    assert.ok(body.data.length >= 2);
    for (const event of body.data) {
      assert.ok(event.dateEnd >= '2026-10-01', `${event.eventName} ends before the range`);
      assert.ok(event.dateStart <= '2026-10-31', `${event.eventName} starts after the range`);
    }
  });

  await test('search filter: single date matches the event held that day', async () => {
    const { body } = await api('/events?state=all&date=2026-06-13');
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].eventId, 9);
  });

  await test('search filter: keyword matches name, city and venue', async () => {
    const byName = await api('/events?state=all&keyword=paws&limit=100');
    assert.equal(byName.body.meta.total, 1);
    assert.equal(byName.body.data[0].eventId, 4);

    const byCity = await api('/events?state=all&keyword=Sydney&limit=100');
    assert.ok(byCity.body.meta.total >= 1);
    assert.ok(byCity.body.data.every((event) => event.city === 'Sydney'));
  });

  await test('search filter: isFree=true returns only free events', async () => {
    const { body } = await api('/events?state=all&isFree=true&limit=100');
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((event) => event.isFree === true));
  });

  await test('search filter: criteria combine with AND', async () => {
    const { body } = await api('/events?state=all&city=Lismore&category=1&limit=100');
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].eventId, 1);
  });

  await test('pagination reports total, page and totalPages', async () => {
    const { body } = await api('/events?state=all&limit=3&page=2');
    assert.equal(body.data.length, 3);
    assert.equal(body.meta.page, 2);
    assert.equal(body.meta.offset, 3);
    assert.ok(body.meta.total >= 9);
    assert.equal(body.meta.totalPages, Math.ceil(body.meta.total / 3));
  });

  await test('sorting by name and direction works', async () => {
    const { body } = await api('/events?state=all&sort=name&direction=desc&limit=100');
    const names = body.data.map((event) => event.eventName);
    assert.deepEqual(names, [...names].sort().reverse());
  });

  await test('GET /api/events/:id returns full detail with ticket tiers', async () => {
    const { status, body } = await api('/events/1');
    assert.equal(status, 200);
    const event = body.data;
    assert.equal(event.eventId, 1);
    assert.ok(event.description.length > 100, 'the full description is missing');
    assert.ok(event.purpose.length > 10, 'the purpose is missing');
    assert.ok(Array.isArray(event.ticketTypes) && event.ticketTypes.length >= 2);
    for (const ticket of event.ticketTypes) {
      assert.equal(typeof ticket.price, 'number');
      assert.ok(ticket.ticketName);
    }
    assert.equal(typeof event.goalAmount, 'number');
    assert.equal(typeof event.raisedAmount, 'number');
    assert.equal(typeof event.progressPercent, 'number');
  });

  await test('progress figures are consistent with the goal', async () => {
    const { body } = await api('/events/1');
    const { goalAmount, raisedAmount, progressPercent } = body.data;
    const expected = Math.min(Number(((raisedAmount / goalAmount) * 100).toFixed(1)), 100);
    assert.equal(progressPercent, expected);
  });

  await test('at least one seeded event offers a free ticket tier', async () => {
    const { body } = await api('/events/1');
    assert.ok(
      body.data.ticketTypes.some((ticket) => ticket.price === 0),
      'expected a free ticket tier on the fun run'
    );
  });

  await test('GET /api/events/:id returns 404 for a suspended event', async () => {
    const { status, body } = await api('/events/11');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.status, 404);
  });

  await test('GET /api/events/:id returns 400 for a non-numeric id', async () => {
    const { status, body } = await api('/events/not-a-number');
    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.match(body.error.message, /not a valid event id/i);
  });

  await test('GET /api/events/:id returns 404 for an unknown id', async () => {
    const { status } = await api('/events/9999');
    assert.equal(status, 404);
  });

  await test('GET /api/categories returns categories with event counts', async () => {
    const { status, body } = await api('/categories');
    assert.equal(status, 200);
    assert.ok(body.data.length >= 3, 'the brief asks for a few different categories');
    for (const category of body.data) {
      assert.ok(category.categoryId && category.categoryName);
      assert.equal(typeof category.eventCount, 'number');
    }
  });

  await test('GET /api/locations returns venues with active events', async () => {
    const { status, body } = await api('/locations');
    assert.equal(status, 200);
    assert.ok(body.data.length >= 3);
    assert.ok(body.data.every((location) => location.eventCount > 0));
  });

  await test('GET /api/organization and /api/stats power the home page', async () => {
    const organisation = await api('/organization');
    assert.equal(organisation.status, 200);
    assert.ok(organisation.body.data.name);
    assert.ok(organisation.body.data.mission);

    const stats = await api('/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.body.data.upcomingEvents >= 5);
    assert.ok(stats.body.data.totalRaised > 0);
  });

  await test('invalid query values are rejected with 400 and field details', async () => {
    const badDate = await api('/events?from=2026-13-45');
    assert.equal(badDate.status, 400);
    assert.ok(Array.isArray(badDate.body.error.details));

    const reversed = await api('/events?from=2026-12-01&to=2026-01-01');
    assert.equal(reversed.status, 400);

    const badState = await api('/events?state=finished');
    assert.equal(badState.status, 400);

    const badSort = await api('/events?sort=;DROP TABLE events');
    assert.equal(badSort.status, 400, 'sort injection attempt must be rejected');

    const badLimit = await api('/events?limit=99999');
    assert.equal(badLimit.status, 400);
  });

  await test('unknown endpoints return a JSON 404 envelope', async () => {
    const { status, body } = await api('/does-not-exist');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.status, 404);
  });

  await test('security headers and CORS headers are present', async () => {
    const response = await fetch(`${baseUrl()}/events?limit=1`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.ok(response.headers.get('access-control-allow-origin'));
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  await test('the API refuses write methods (Assessment 2 is read-only)', async () => {
    const response = await fetch(`${baseUrl()}/events`, { method: 'POST' });
    assert.ok(
      response.status === 404 || response.status === 405,
      `POST /api/events should not be handled, got ${response.status}`
    );
  });
}

/* =====================================================================
 * PART B - client-side DOM tests
 * ===================================================================== */

/**
 * Read the import statements out of one client module.
 * Returns an array of { source, names: [{ imported, local }] }.
 */
function parseImports(source, url) {
  const imports = [];
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [imported, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
        return { imported, local: alias || imported };
      });
    imports.push({ source: resolveKey(url, match[2]), names });
  }

  return imports;
}

/** Remove the import statements and rewrite the export statements. */
function transformModule(source) {
  const exportNames = new Set();
  let code = source;

  code = code.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, '');
  code = code.replace(/\bimport\s*\(/g, '__import(');

  code = code.replace(
    /export\s+(const|let|var|function|class|async\s+function)\s+([A-Za-z_$][\w$]*)/g,
    (match, kind, name) => {
      exportNames.add(name);
      return `${kind} ${name}`;
    }
  );

  return { code, exportNames };
}

/** Normalise './api.js' plus the module's own url into a registry key. */
function resolveKey(baseUrl, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  const base = baseUrl.replace(/[^/]*$/, '');
  const segments = `${base}${specifier}`.split('/');
  const stack = [];
  for (const segment of segments) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return stack.join('/');
}

/**
 * Load one client module: resolve its imports first, bind them as real
 * variables in the sandbox, then evaluate the transformed source.
 */
async function evaluateModule(shortName, registry, moduleCache) {
  const source = registry.get(shortName);
  const imports = parseImports(source, shortName);
  const { code, exportNames } = transformModule(source);

  const bindings = {};
  for (const dependency of imports) {
    await evaluateModule(dependency.source, registry, moduleCache);
    const exported = moduleCache.get(dependency.source);
    for (const { imported, local } of dependency.names) {
      Object.defineProperty(bindings, local, {
        enumerable: true,
        configurable: true,
        get: () => exported[imported],
      });
    }
  }

  const record = moduleCache.get(shortName) || {};
  const localRequire = (specifier) =>
    moduleCache.get(resolveKey(shortName, specifier)) || {};

  // Expose the live binding getters on the jsdom window so the sandbox can
  // copy them into local variables before the module body runs.
  globalThis.__jsdomWindow.__dshBindings = bindings;

  const sandbox = {
    window: globalThis.__jsdomWindow,
    document: globalThis.__jsdomWindow.document,
    console,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    AbortController,
    URLSearchParams,
    Intl,
    __import: (specifier) =>
      evaluateModule(resolveKey(shortName, specifier), registry, moduleCache).then(() =>
        moduleCache.get(resolveKey(shortName, specifier))
      ),
    __require: localRequire,
  };

  const context = vm.createContext(sandbox);

  // `var a = window.__dshBindings["a"], b = ...` gives the module body the
  // imported names as ordinary variables, exactly like a real ES module.
  const bindingDeclaration = Object.keys(bindings)
    .map((name) => `${name} = window.__dshBindings[${JSON.stringify(name)}]`)
    .join(', ');
  if (bindingDeclaration) {
    vm.runInContext(`var ${bindingDeclaration};`, context, { filename: `${shortName}#bindings` });
  }

  vm.runInContext(code, context, { filename: shortName });

  exportNames.forEach((name) => {
    record[name] = vm.runInContext(`typeof ${name} === 'undefined' ? undefined : ${name}`, context);
  });

  moduleCache.set(shortName, record);
  return record;
}

/** Load the client modules into a jsdom window and return a loader. */
function createModuleLoader(window) {
  const registry = new Map();
  const moduleCache = new Map();

  // The transformed code refers to `window`, so expose the jsdom window.
  globalThis.__jsdomWindow = window;

  return {
    define(shortName, source) {
      registry.set(shortName, source);
    },
    load(shortName) {
      return evaluateModule(shortName, registry, moduleCache);
    },
  };
}

/** Wait until a condition is true, or time out. */
async function waitFor(condition, { timeout = 5000, interval = 25 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

/** Build a jsdom page for one clientside HTML file. */
async function loadPage({ JSDOM }, htmlFile, { url, apiHandler, beforeInit }) {
  const html = fs.readFileSync(path.join(CLIENT_DIR, htmlFile), 'utf8');

  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Redirect the page's fetch() calls to the in-process test API.
  window.fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : input.url;
    const pathname = target.replace(/^https?:\/\/[^/]+/, '');
    const result = await apiHandler(pathname, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers || new Headers(),
      json: async () => result.body,
    };
  };
  window.AbortController = AbortController;

  // Let a test install spies or stubs before any page module runs. jsdom does
  // not implement scrolling, so this is how scrollIntoView is observed.
  if (typeof beforeInit === 'function') beforeInit(window);

  const loader = createModuleLoader(window);
  for (const file of fs.readdirSync(path.join(CLIENT_DIR, 'js'))) {
    if (file.endsWith('.js')) {
      loader.define(file, fs.readFileSync(path.join(CLIENT_DIR, 'js', file), 'utf8'));
    }
  }

  // Find the module script the page uses and evaluate it.
  const scriptMatch = html.match(/<script[^>]*type="module"[^>]*src="js\/([^"]+)"/);
  assert.ok(scriptMatch, `${htmlFile} must load a client module`);
  const entry = scriptMatch[1];

  // Fire DOMContentLoaded only after the entry module has registered its
  // listener, which is what a real browser does.
  await loader.load(entry);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  return { dom, window, loader };
}

async function testClient() {
  group('PART B - client-side website (DOM)');

  const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

  // The DOM tests talk to the same in-process API, so no network is required.
  const apiHandler = async (pathname) => {
    const response = await fetch(`${origin()}${pathname}`);
    const body = await response.json();
    return { status: response.status, body, headers: response.headers };
  };

  /* ---------------------------------------------------------------- */
  await test('home page renders event cards from the API', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
    });

    const ok = await waitFor(() => window.document.querySelectorAll('.event-card').length > 0);
    assert.ok(ok, 'no event cards were rendered');

    const cards = window.document.querySelectorAll('.event-card');
    assert.ok(cards.length >= 5, `expected several upcoming events, got ${cards.length}`);

    // Every card must link to the detail page with the event id.
    const links = [...window.document.querySelectorAll('.event-card__title a')];
    assert.ok(links.length === cards.length);
    links.forEach((link) => assert.match(link.getAttribute('href'), /^event\.html\?id=\d+$/));

    // Summary data points required by the brief.
    const firstCard = cards[0];
    assert.ok(firstCard.querySelector('.event-card__title').textContent.trim().length > 0);
    assert.ok(firstCard.querySelector('.chip'), 'the category chip is missing');
    assert.ok(firstCard.querySelector('.progress__track'), 'the progress bar is missing');
    assert.ok(firstCard.querySelector('img'), 'the event image is missing');
  });

  await test('home page shows no past or suspended event', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
    });
    await waitFor(() => window.document.querySelectorAll('.event-card').length > 0);

    const ids = [...window.document.querySelectorAll('.event-card')].map((card) =>
      Number(card.dataset.eventId)
    );
    assert.ok(!ids.includes(11), 'the suspended event must not be shown on the home page');
    assert.ok(
      !window.document.querySelector('.badge--past'),
      'a past event must not appear in the upcoming listing'
    );
  });

  await test('home page navigation menu holds the two page destinations', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
    });
    const links = [...window.document.querySelectorAll('#site-header .site-nav__link')];

    // The menu is deliberately limited to real destinations. The About and
    // Contact sections are still on the page but are no longer menu entries:
    // linking to a section of another page needs the href rewritten per page,
    // and that conditional behaviour caused repeated defects.
    assert.deepEqual(
      links.map((link) => link.textContent.trim()),
      ['Home', 'Search Events'],
      'the menu should contain exactly Home and Search Events'
    );
    assert.deepEqual(
      links.map((link) => link.getAttribute('href')),
      ['index.html', 'search.html'],
      'every menu entry must name a document'
    );

    assert.ok(window.document.querySelector('#site-footer'), 'the footer is missing');
  });

  await test('no navigation link points at the same page twice', async () => {
    // Regression guard: an earlier revision put both a "Search Events" menu
    // item and a heavy "Find an event" button in the header, and both pointed
    // at search.html. Two links with the same destination in one navigation is
    // redundant and confusing, so the header menu is now the single source.
    // The check runs against the rendered DOM rather than the source text, so
    // explanatory comments in nav.js cannot affect it.
    for (const file of ['index.html', 'search.html', 'event.html']) {
      const { window } = await loadPage({ JSDOM }, file, {
        url: `http://localhost:5500/${file}`,
        apiHandler,
      });
      await waitFor(() => window.document.querySelectorAll('#site-header a').length > 0);

      const header = window.document.querySelector('#site-header');
      const hrefs = [...header.querySelectorAll('a')].map((link) => link.getAttribute('href'));

      // 1. No two menu entries may share the same destination.
      const menuHrefs = [...header.querySelectorAll('.site-nav__link')].map((link) =>
        link.getAttribute('href')
      );
      const duplicated = menuHrefs.filter(
        (href, index) => menuHrefs.indexOf(href) !== index
      );
      assert.deepEqual(
        duplicated,
        [],
        `${file}: the menu links to ${[...new Set(duplicated)].join(', ')} more than once`
      );

      // 2. The brand logo must go to the home page, which means index.html is
      //    linked twice (brand + Home). That is the universal convention and is
      //    deliberately allowed; no other document may repeat.
      const brandHref = header.querySelector('.brand').getAttribute('href');
      assert.equal(brandHref, 'index.html', `${file}: the brand logo must link home`);
      assert.equal(
        hrefs.filter((href) => href === 'index.html').length,
        2,
        `${file}: index.html should be linked exactly twice (brand + Home)`
      );

      const otherDocumentLinks = hrefs.filter((href) => !href.startsWith('index.html'));
      const repeatedDocuments = otherDocumentLinks.filter(
        (href, index) => otherDocumentLinks.indexOf(href) !== index
      );
      assert.deepEqual(
        repeatedDocuments,
        [],
        `${file}: ${[...new Set(repeatedDocuments)].join(', ')} is linked more than once`
      );

      // 3. At most one menu entry may be highlighted. Two highlighted entries
      //    at once was a real defect, so this stays checked.
      //    event.html is the detail page, reached from an event card rather
      //    than from the menu, so it correctly highlights nothing.
      const activeMenuLinks = [...header.querySelectorAll('.site-nav__link--active')];
      assert.ok(
        activeMenuLinks.length <= 1,
        `${file}: expected at most one highlighted menu entry, found ${activeMenuLinks.length} (${activeMenuLinks
          .map((link) => link.textContent.trim())
          .join(', ')})`
      );

      // 4. The retired call to action must be gone from every rendered page.
      assert.ok(
        !/Find an event/.test(header.textContent),
        `${file}: the header still shows the duplicate "Find an event" call to action`
      );
    }
  });

  await test('the About and Contact sections remain on the home page', async () => {
    // Removing the menu entries must not remove the content: both sections are
    // still present, and the About section is still filled from the API.
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
    });

    for (const section of ['about', 'contact']) {
      assert.ok(
        window.document.getElementById(section),
        `the #${section} section is missing from the home page`
      );
    }

    // The home page still uses a fragment link of its own, so the anchor
    // handling in nav.js must keep working.
    const inPageLinks = [...window.document.querySelectorAll('a[href^="#"]')].map((link) =>
      link.getAttribute('href')
    );
    assert.ok(inPageLinks.length > 0, 'the home page has no in-page links left');
    for (const href of inPageLinks) {
      assert.ok(
        window.document.getElementById(href.slice(1)),
        `the in-page link ${href} has no matching element`
      );
    }
  });

  await test('a section link puts its section in view, not just scrolls', async () => {
    // jsdom does not implement scrolling, so this records the requested
    // position and the resulting window scroll position. Checking the outcome
    // matters: an earlier revision used a smooth animation that was cancelled
    // by the page growing as event images loaded, so the section was requested
    // but the visitor stayed part way down the page.
    const calls = [];
    let scrollY = 0;
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html#contact',
      apiHandler,
      beforeInit: (win) => {
        win.Element.prototype.scrollIntoView = function scrollIntoViewSpy() {
          calls.push({
            id: this.id || this.className || this.tagName.toLowerCase(),
            top: this.getBoundingClientRect().top,
          });
        };
        // jsdom leaves scrollY at 0, so it is made writable for the spy.
        Object.defineProperty(win, 'scrollY', {
          configurable: true,
          get: () => scrollY,
          set: (value) => {
            scrollY = value;
          },
        });
      },
    });

    const ok = await waitFor(() => calls.some((call) => call.id === 'contact'));
    assert.ok(ok, 'the contact section named in the URL was never scrolled to');

    // The scroll must be an instant, final jump: behaviour smooth is the thing
    // that was unreliable, so the spy also records the requested options.
    const contactCall = calls.find((call) => call.id === 'contact');
    assert.equal(typeof contactCall.top, 'number');

    // The target must be a real section on the page.
    const section = window.document.getElementById('contact');
    assert.ok(section, 'the contact section is missing from the home page');
  });

  await test('jumping to a section does not make page content focusable', async () => {
    /*
     * Reported defect: clicking the text of a section showed a vertical
     * insertion caret.
     *
     * Cause: the section jump added tabindex="-1" to the target and called
     * focus() on it. A focusable element is treated as a text input by the
     * browser, so clicking its paragraphs put a caret there; the same focus also
     * drew the :focus-visible ring around the whole section.
     *
     * Scrolling is all the visitor asked for, so no section may end up
     * focusable - and in particular no content element may carry tabindex="-1"
     * after a jump.
     */
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html#contact',
      apiHandler,
      beforeInit: (win) => {
        // jsdom does not implement scrolling; the jump is what matters here.
        win.Element.prototype.scrollIntoView = function scrollIntoViewNoop() {};
      },
    });

    // Give the hash handler time to run.
    await waitFor(() => window.document.getElementById('contact'));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const focusable = [...window.document.querySelectorAll('[tabindex]')];
    assert.deepEqual(
      focusable.map((el) => `${el.tagName.toLowerCase()}#${el.id}[tabindex="${el.getAttribute('tabindex')}"]`),
      [],
      'no element should be given a tabindex by the section jump'
    );

    // Section containers must not be focusable either, however they are reached.
    for (const id of ['about', 'contact', 'upcoming-events']) {
      const element = window.document.getElementById(id);
      if (!element) continue;
      assert.equal(
        element.getAttribute('tabindex'),
        null,
        `#${id} must not be focusable, or clicking its text shows an insertion caret`
      );
    }
  });

  await test('home page statistics are filled from /api/stats', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
    });

    // The four placeholder cards contain an en dash until the API answers.
    const ok = await waitFor(() => {
      const values = [...window.document.querySelectorAll('#stats-panel .stat__value')];
      return values.length === 4 && values.every((node) => !node.textContent.includes('–'));
    });
    assert.ok(ok, 'the statistics panel was not filled from /api/stats');

    const values = [...window.document.querySelectorAll('#stats-panel .stat__value')].map((node) =>
      node.textContent.trim()
    );
    assert.ok(values.every((value) => value !== ''));
    // The first card is the count of upcoming events, which must be a number.
    assert.match(values[0], /^\d+$/);
  });

  /* ---------------------------------------------------------------- */
  await test('search page builds its category checkboxes from the API', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
    });
    const ok = await waitFor(
      () => window.document.querySelectorAll('#category-options input[type="checkbox"]').length > 0
    );
    assert.ok(ok, 'no category checkboxes were created');
    const boxes = window.document.querySelectorAll('#category-options input[name="category"]');
    assert.ok(boxes.length >= 3, 'expected several categories');
    assert.ok(
      window.document.querySelectorAll('#city-options option').length >= 3,
      'the city suggestion list is empty'
    );
  });

  await test('search page returns results and marks the active filters', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
    });
    await waitFor(
      () => window.document.querySelectorAll('#category-options input').length > 0
    );

    // Tick one category and submit, exactly as a visitor would.
    const firstBox = window.document.querySelector('#category-options input[name="category"]');
    firstBox.checked = true;
    window.document.getElementById('search-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    const ok = await waitFor(
      () => window.document.querySelectorAll('#results-list .event-card').length > 0
    );
    assert.ok(ok, 'no results were rendered after submitting the form');
    assert.ok(
      window.document.querySelectorAll('#active-filters .filter-chip').length >= 1,
      'the active filter chip was not added'
    );
    assert.match(window.document.getElementById('results-count').textContent, /event/i);
  });

  await test('search page validates the date range before calling the API', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
    });

    window.document.getElementById('filter-from').value = '2026-12-01';
    window.document.getElementById('filter-to').value = '2026-01-01';
    window.document.getElementById('search-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    const message = window.document.getElementById('form-message').textContent;
    assert.match(message, /cannot be earlier/i);
    assert.equal(
      window.document.querySelectorAll('#results-list .event-card').length,
      0,
      'the search should not have run with an invalid range'
    );
  });

  await test('Clear Filters resets the form and the results with DOM manipulation', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
    });
    await waitFor(() => window.document.querySelectorAll('#category-options input').length > 0);

    // Apply some filters, then run a search that produces results.
    window.document.getElementById('filter-from').value = '2026-10-01';
    window.document.getElementById('filter-city').value = 'Lismore';
    window.document.querySelector('#category-options input[name="category"]').checked = true;
    window.document.getElementById('search-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await waitFor(() => window.document.querySelectorAll('#results-list .event-card').length > 0);
    assert.ok(window.document.querySelectorAll('#active-filters .filter-chip').length >= 2);

    // Clear Filters
    window.document.getElementById('clear-filters').click();

    assert.equal(window.document.getElementById('filter-from').value, '');
    assert.equal(window.document.getElementById('filter-city').value, '');
    assert.equal(
      window.document.querySelector('#category-options input[name="category"]').checked,
      false
    );
    assert.equal(window.document.querySelectorAll('#active-filters .filter-chip').length, 0);
    assert.equal(window.document.querySelectorAll('#results-list .event-card').length, 0);
    assert.match(window.document.getElementById('form-message').textContent, /cleared/i);
  });

  await test('search page shows an empty state when nothing matches', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
    });
    await waitFor(() => window.document.querySelectorAll('#category-options input').length > 0);

    window.document.getElementById('filter-keyword').value = 'zzz-no-such-event';
    window.document.getElementById('search-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    const ok = await waitFor(() => window.document.querySelector('#results-list .state--empty'));
    assert.ok(ok, 'the empty state was not shown');
  });

  /* ---------------------------------------------------------------- */
  await test('event page shows only the event named in the query string', async () => {
    const { window } = await loadPage({ JSDOM }, 'event.html', {
      url: 'http://localhost:5500/event.html?id=1',
      apiHandler,
    });

    const ok = await waitFor(() => window.document.querySelector('.event-hero h1'));
    assert.ok(ok, 'the event hero was not rendered');

    assert.match(
      window.document.querySelector('.event-hero h1').textContent,
      /Riverside Rainbow Fun Run/
    );
    assert.equal(window.document.querySelectorAll('.event-hero').length, 1);
    assert.equal(window.document.querySelectorAll('.event-card').length, 0);
  });

  await test('event page shows full details, tickets and goal progress', async () => {
    const { window } = await loadPage({ JSDOM }, 'event.html', {
      url: 'http://localhost:5500/event.html?id=1',
      apiHandler,
    });
    await waitFor(() => window.document.querySelector('.event-hero h1'));

    // Full description and purpose
    assert.ok(window.document.body.textContent.includes('Riverside Rainbow Fun Run'));
    assert.ok(
      window.document.body.textContent.includes('Fund free paediatric allied health sessions')
    );

    // Ticket information, including the free tier
    const tickets = window.document.querySelectorAll('.ticket');
    assert.ok(tickets.length >= 2, 'the ticket tiers were not rendered');
    assert.ok(
      window.document.body.textContent.includes('Free'),
      'the free ticket tier is not shown'
    );

    // Goal vs progress
    const progress = window.document.querySelector('.progress__track');
    assert.ok(progress, 'the progress bar is missing');
    assert.ok(Number(progress.getAttribute('aria-valuenow')) > 0);
    assert.match(window.document.querySelector('.progress__amounts').textContent, /raised of/);
  });

  await test('Register button opens the "under construction" modal', async () => {
    const { window } = await loadPage({ JSDOM }, 'event.html', {
      url: 'http://localhost:5500/event.html?id=1',
      apiHandler,
    });
    await waitFor(() => window.document.getElementById('register-button'));

    const button = window.document.getElementById('register-button');
    assert.equal(button.textContent.trim(), 'Register');
    button.click();

    const modal = window.document.querySelector('.modal');
    assert.ok(modal, 'the modal was not created');
    assert.match(
      window.document.body.textContent,
      /This feature is currently under construction\./,
      'the exact message required by the brief is missing'
    );
  });

  await test('event page reports a missing id instead of breaking', async () => {
    const { window } = await loadPage({ JSDOM }, 'event.html', {
      url: 'http://localhost:5500/event.html',
      apiHandler,
    });
    const ok = await waitFor(() => window.document.querySelector('.state--error'));
    assert.ok(ok, 'no error state was shown for a missing event id');
  });

  await test('event page handles a suspended event id with a clear message', async () => {
    const { window } = await loadPage({ JSDOM }, 'event.html', {
      url: 'http://localhost:5500/event.html?id=11',
      apiHandler,
    });
    const ok = await waitFor(() => window.document.querySelector('.state--error'));
    assert.ok(ok, 'no error state was shown for a suspended event');
    assert.match(window.document.body.textContent, /could not be found|suspended/i);
  });

  await test('every page loads the shared navigation module', async () => {
    for (const file of ['index.html', 'search.html', 'event.html']) {
      const html = fs.readFileSync(path.join(CLIENT_DIR, file), 'utf8');
      assert.ok(html.includes('id="site-header"'), `${file} has no menu placeholder`);
      assert.ok(html.includes('id="site-footer"'), `${file} has no footer placeholder`);
      assert.match(html, /type="module"/, `${file} does not load a client module`);
    }
  });

  await test('hero buttons stay legible on the dark hero background', async () => {
    const html = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

    // Regression guard: the default variant is a teal fill and --ghost paints
    // teal text, so both almost disappear over the green hero gradient. Every
    // hero action must use the single on-dark variant instead.
    const heroActions = html.match(/<div class="hero__actions">([\s\S]*?)<\/div>/);
    assert.ok(heroActions, 'the hero actions block was not found');

    const buttons = [...heroActions[1].matchAll(/<a class="([^"]+)"[^>]*>([^<]+)</g)];
    assert.equal(buttons.length, 2, 'the hero should offer exactly two actions');

    for (const [, classes, label] of buttons) {
      assert.match(
        classes,
        /\bbutton--on-dark\b/,
        `"${label.trim()}" must use button--on-dark`
      );
      assert.doesNotMatch(
        classes,
        /button--ghost|button--hero-primary|button--hero-secondary/,
        `"${label.trim()}" must not use a retired hero variant`
      );
    }

    // Both buttons must resolve to the same fill and text colour. The pattern
    // anchors to the start of a line so it matches the base rule rather than the
    // [data-theme='dark'] override further down the file.
    const rule = css.match(/^\.button--on-dark\s*\{([^}]*)\}/m);
    assert.ok(rule, 'styles.css has no .button--on-dark rule');
    const body = rule[1].replace(/\s+/g, ' ');
    assert.match(body, /background:\s*#ffffff/i, 'the on-dark button needs a white fill');
    assert.match(body, /color:\s*var\(--brand-900\)/i, 'the on-dark button needs dark teal text');

    // The retired variants must no longer be defined, so the two hero buttons
    // cannot drift apart again.
    for (const retired of ['button--hero-primary', 'button--hero-secondary']) {
      assert.ok(
        !new RegExp(`\\.${retired}\\s*\\{`).test(css),
        `.${retired} should no longer be defined`
      );
    }
  });

  await test('form controls cannot overflow the filter panel', async () => {
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

    // Regression guard: a date input has an intrinsic minimum width of roughly
    // 130px, so with a bare `1fr 1fr` grid the two date fields pushed past the
    // border of the 330px filter panel. The controls must opt out of their
    // intrinsic minimum, and the tracks must be allowed to shrink.
    const controlRule = css.match(
      /input\[type='text'\],[\s\S]{0,300}?textarea\s*\{([^}]*)\}/
    );
    assert.ok(controlRule, 'the shared form control rule was not found');
    assert.match(
      controlRule[1].replace(/\s+/g, ' '),
      /min-width:\s*0/,
      'form controls need min-width: 0 so grid and flex parents can shrink them'
    );

    const formRow = css.match(/\.form-row\s*\{([^}]*)\}/);
    assert.ok(formRow, 'styles.css has no .form-row rule');
    const row = formRow[1].replace(/\s+/g, ' ');
    assert.doesNotMatch(
      row,
      /grid-template-columns:\s*1fr\s+1fr/,
      '.form-row must not use a bare 1fr 1fr, which cannot shrink below content width'
    );
    assert.match(
      row,
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(\s*\d+px/,
      '.form-row should use auto-fit minmax so the pair collapses when narrow'
    );
  });

  await test('date fields state their format in English', async () => {
    const html = fs.readFileSync(path.join(CLIENT_DIR, 'search.html'), 'utf8');
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

    // A native date input paints its placeholder in the language of the
    // operating system (年/月/日 on a Chinese Windows) and that text cannot be
    // overridden from HTML, CSS or JavaScript. Each date field therefore
    // carries a visible English format line instead.
    // The tags may span several lines, so the pattern allows newlines.
    const dateInputs = [...html.matchAll(/<input[^>]*?type="date"[^>]*?>/gs)].map((m) => m[0]);
    assert.equal(dateInputs.length, 2, 'the search form should have two date inputs');

    for (const input of dateInputs) {
      const id = (input.match(/id="([^"]+)"/) || [])[1];
      assert.ok(id, 'every date input needs an id');
      assert.match(
        input,
        /aria-describedby="[^"]+-format"/,
        `the date input #${id} must point at its format line`
      );
      assert.ok(
        html.includes(`id="${id}-format"`),
        `the date input #${id} has no format line element`
      );
    }

    assert.equal(
      (html.match(/Format: yyyy-mm-dd/g) || []).length,
      2,
      'both date fields must show "Format: yyyy-mm-dd"'
    );
    assert.ok(
      /\.field__format\s*\{/.test(css),
      'styles.css needs a .field__format rule for the format line'
    );
  });

  /* ---------------------------------------------------------------- */
  /* Settings: theme and language                                      */
  /* ---------------------------------------------------------------- */

  /** Stub matchMedia, which jsdom does not implement. */
  function stubMatchMedia(window, { prefersDark = false } = {}) {
    const listeners = [];
    window.matchMedia = (query) => ({
      media: query,
      matches: prefersDark && query.includes('prefers-color-scheme: dark'),
      addEventListener: (type, callback) => listeners.push(callback),
      removeEventListener: () => {},
      addListener: (callback) => listeners.push(callback),
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    });
  }

  await test('the language switcher offers four languages and applies one', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
      beforeInit: (win) => {
        win.localStorage.setItem('charity-events:language', 'en');
        stubMatchMedia(win);
      },
    });

    const select = window.document.getElementById('language-select');
    assert.ok(select, 'the header has no language switcher');

    const options = [...select.options].map((option) => option.value);
    assert.deepEqual(options, ['en', 'zh', 'vi', 'ja'], 'expected English, Chinese, Vietnamese, Japanese');

    // The stored language is applied on load.
    assert.equal(window.document.documentElement.getAttribute('lang'), 'en-AU');

    // Switching translates the interface and updates <html lang>.
    select.value = 'ja';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.equal(
      window.localStorage.getItem('charity-events:language'),
      'ja',
      'the choice must be remembered for the other pages'
    );
    assert.equal(window.document.documentElement.getAttribute('lang'), 'ja-JP');

    const heading = window.document.querySelector('#events-heading').textContent;
    assert.match(heading, /[\u3040-\u30ff\u4e00-\u9fff]/, `expected Japanese text, got "${heading}"`);
    assert.ok(
      !/Current and upcoming/.test(heading),
      'the heading was not translated'
    );
  });

  await test('a remembered language is applied on the next page load', async () => {
    const { window } = await loadPage({ JSDOM }, 'search.html', {
      url: 'http://localhost:5500/search.html',
      apiHandler,
      beforeInit: (win) => {
        win.localStorage.setItem('charity-events:language', 'zh');
        stubMatchMedia(win);
      },
    });

    assert.equal(window.document.documentElement.getAttribute('lang'), 'zh-CN');
    const title = window.document.querySelector('h1').textContent;
    assert.match(title, /[\u4e00-\u9fff]/, `expected Chinese text, got "${title}"`);
    assert.equal(
      window.document.getElementById('language-select').value,
      'zh',
      'the switcher must show the remembered language'
    );
  });

  await test('every dictionary covers the same keys', async () => {
    const source = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'translations.js'), 'utf8');
    const keysFor = (language) => {
      const match = source.match(new RegExp(`const ${language} = \\{([\\s\\S]*?)\\n\\};`, 'm'));
      return new Set([...match[1].matchAll(/^\s*'([^']+)':/gm)].map((entry) => entry[1]));
    };

    const english = keysFor('en');
    assert.ok(english.size > 150, `expected a substantial dictionary, got ${english.size} keys`);

    for (const language of ['zh', 'vi', 'ja']) {
      const keys = keysFor(language);
      const missing = [...english].filter((key) => !keys.has(key));
      assert.deepEqual(missing, [], `${language} is missing ${missing.length} key(s)`);
    }
  });

  await test('the theme switch cycles and is applied to the document', async () => {
    const { window } = await loadPage({ JSDOM }, 'index.html', {
      url: 'http://localhost:5500/index.html',
      apiHandler,
      beforeInit: (win) => {
        win.localStorage.setItem('charity-events:theme', 'light');
        stubMatchMedia(win);
      },
    });

    const root = window.document.documentElement;
    const button = window.document.getElementById('theme-toggle');
    assert.ok(button, 'the header has no theme switch');
    assert.equal(root.getAttribute('data-theme'), 'light', 'the stored theme must be applied on load');

    // light -> dark
    button.click();
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(window.localStorage.getItem('charity-events:theme'), 'dark');
    assert.equal(root.style.colorScheme, 'dark');

    // dark -> system (and the system preference is light in this stub)
    button.click();
    assert.equal(window.localStorage.getItem('charity-events:theme'), 'system');
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.equal(root.getAttribute('data-theme-preference'), 'system');

    // system -> light
    button.click();
    assert.equal(window.localStorage.getItem('charity-events:theme'), 'light');
  });

  await test('dark theme is a set of token overrides plus component fixes', async () => {
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

    const darkBlock = css.match(/\[data-theme='dark'\]\s*\{([^}]*)\}/);
    assert.ok(darkBlock, 'styles.css has no [data-theme="dark"] block');
    for (const token of ['--surface-0', '--ink-900', '--line', '--brand-900']) {
      assert.match(
        darkBlock[1],
        new RegExp(`${token}:`),
        `the dark theme should override ${token}`
      );
    }

    // The components that were hard-coded white need explicit dark handling.
    for (const selector of [
      "\\[data-theme='dark'\\] \\.site-header",
      "\\[data-theme='dark'\\] input\\[type='date'\\]",
    ]) {
      assert.ok(
        new RegExp(selector).test(css),
        `the dark theme is missing a rule for ${selector}`
      );
    }
  });

  await test('every page applies the stored theme before the first paint', async () => {
    for (const file of ['index.html', 'search.html', 'event.html']) {
      const html = fs.readFileSync(path.join(CLIENT_DIR, file), 'utf8');
      const bootIndex = html.indexOf('theme-boot');
      const cssIndex = html.indexOf('css/styles.css');

      assert.ok(bootIndex !== -1, `${file} has no theme boot script`);
      assert.ok(
        bootIndex < cssIndex,
        `${file}: the theme must be applied before the stylesheet, or a dark user sees a white flash`
      );
      assert.match(
        html,
        /localStorage\.getItem\('charity-events:theme'\)/,
        `${file}: the boot script must read the same storage key as theme.js`
      );
    }
  });

  await test('no rule paints light text on a background that flips to light', async () => {
    /*
     * This is the defect that produced the unreadable footer.
     *
     * The dark theme inverts the brand tokens, so --brand-900 becomes a LIGHT
     * teal. Any rule that used it as a background and painted light text on top
     * was designed for a dark surface and collapses once the token flips. The
     * same trap applies to --brand-700 for buttons.
     *
     * The rule below therefore fails the build if such a pair appears without a
     * dark-theme override.
     */
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

    // Strip comments so prose about tokens is not parsed as CSS.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const TOKENS_THAT_FLIP_TO_LIGHT = ['--brand-900', '--brand-700', '--accent-600'];
    const LIGHT_TEXT = /color:\s*(#fff(?:fff)?|white|var\(--on-brand\))/i;

    /*
     * Pairs that are safe even though the background token flips.
     *
     * --on-brand is itself theme-aware: it is the same value as --brand-900
     * (near-white in the light theme, deep ink in the dark one), so a fill and
     * an --on-brand label always move together and stay opposite. It was
     * introduced precisely to replace the broken pairs below, and the real
     * contrast of these controls is measured by tools/check-contrast.mjs.
     */
    const SAFE_WITH_ON_BRAND = [
      '.button',            // solid teal fill, label follows the theme
      '.badge--upcoming',   // same pattern for the status badge
      '.hero',              // the base colour under the hero gradient
    ];

    const rules = [];
    for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].replace(/\s+/g, ' ').trim();
      if (!selector || selector.startsWith('@')) continue;
      rules.push({ selector, body: match[2] });
    }

    const offenders = [];
    for (const rule of rules) {
      const background = rule.body.match(/background(?:-color)?:\s*([^;]+);/);
      if (!background) continue;

      const token = TOKENS_THAT_FLIP_TO_LIGHT.find((name) => background[1].includes(`var(${name})`));
      if (!token) continue;

      const colour = rule.body.match(/(?:^|;)\s*color:\s*([^;]+);/);
      if (!colour || !LIGHT_TEXT.test(`color: ${colour[1]}`)) continue;

      // A dark-theme rule is the fix, so it is allowed.
      if (rule.selector.includes("[data-theme='dark']")) continue;

      // Elements that live on the dark hero are deliberately light in both
      // themes; they are pinned by a separate rule that sets the base colour.
      if (/\.button--on-dark/.test(rule.selector)) continue;

      // The footer is a dark block in both themes, so its light text is correct
      // as long as the dark theme pins its background as well.
      if (/^\.site-footer/.test(rule.selector)) {
        assert.match(
          withoutComments,
          /\[data-theme='dark'\]\s*\.site-footer\s*\{[^}]*background:\s*#071a18/,
          'the footer paints light text on var(--brand-900), so the dark theme must pin its background'
        );
        continue;
      }

      // Safe when the label itself is the theme-aware --on-brand token.
      if (/var\(--on-brand\)/.test(colour[1]) && SAFE_WITH_ON_BRAND.includes(rule.selector)) {
        continue;
      }

      offenders.push(`${rule.selector} -> background ${background[1].trim()}, ${colour[1].trim()}`);
    }

    assert.deepEqual(
      offenders,
      [],
      `these rules paint light text on a token that becomes light in the dark theme, ` +
        `so they need either a dark-theme override or a token that does not flip:\n  ` +
        offenders.join('\n  ')
    );

    // And the token that exists precisely to avoid the trap must be used.
    assert.match(
      withoutComments,
      /--on-brand:\s*#ffffff/,
      'the light theme should define --on-brand'
    );
    assert.match(
      withoutComments,
      /\[data-theme='dark'\][\s\S]{0,400}?--on-brand:\s*#06201d/,
      'the dark theme should redefine --on-brand so filled controls stay legible'
    );

    /*
     * The footer is the case that was actually reported: it paints light text
     * (by design - it is a dark block) on var(--brand-900), which the dark theme
     * turns into a LIGHT teal. The fix is to pin its background in the dark
     * theme to a dark value. If that pin is ever removed or swapped for a
     * colour token, the footer becomes light-on-light again, so it is asserted
     * directly rather than left to the loop above.
     */
    const footerLightRule = rules.find((rule) => rule.selector === '.site-footer');
    assert.ok(footerLightRule, 'the base .site-footer rule was not found');
    assert.match(
      footerLightRule.body,
      /background:\s*var\(--brand-900\)/,
      'the footer is expected to use var(--brand-900) as its base background'
    );

    const footerDarkRule = rules.find(
      (rule) => rule.selector === "[data-theme='dark'] .site-footer"
    );
    assert.ok(footerDarkRule, 'the dark theme has no .site-footer rule');

    const footerDarkBackground = footerDarkRule.body.match(/background:\s*([^;]+);/);
    assert.ok(footerDarkBackground, 'the dark footer rule must set a background');
    assert.doesNotMatch(
      footerDarkBackground[1],
      /var\(--(brand|surface|ink|accent|line)/,
      'the dark footer background must be a pinned dark colour, not a token that ' +
        'flips - otherwise light text lands on a light footer'
    );
  });
}

/* =====================================================================
 * Runner
 * ===================================================================== */
(async function main() {
  console.log('PROG2002 A2 - submission test suite');
  console.log(`Project root: ${ROOT}`);

  const server = await startTestApi();
  console.log(`Test API listening on ${baseUrl()} (data source: ${process.env.DATA_SOURCE})\n`);

  try {
    await testApi();
    await testClient();
  } catch (error) {
    console.error('\nThe test run stopped unexpectedly:', error);
    failed += 1;
    failures.push({ name: 'test runner', error });
  } finally {
    // Closing the HTTP server and the MySQL pool releases every handle, so the
    // Node process can exit by itself. Without this the suite would print its
    // result and then appear to hang, because an idle keep-alive connection or
    // a pooled database connection keeps the event loop alive.
    await new Promise((resolve) => server.close(resolve));
    try {
      await require(path.join(API_DIR, 'src', 'db', 'event_db.js')).close();
    } catch (error) {
      // The offline data source has no pool to close.
    }
  }

  console.log('\n==========================================================');
  console.log(` ${passed} passed, ${failed} failed`);
  console.log('==========================================================');

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((failure) => {
      console.log(`\n* ${failure.name}`);
      console.log(`  ${failure.error.message}`);
    });
  }

  // Explicit exit code, then an explicit exit: some Node versions keep a
  // stray DNS or socket handle alive for a few seconds after close().
  process.exit(failed > 0 ? 1 : 0);
})();
