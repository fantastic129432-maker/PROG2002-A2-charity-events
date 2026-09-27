/**
 * js/nav.js
 * ---------------------------------------------------------------------------
 * The menu is defined once, in js/config.js, and every page provides two empty
 * placeholders:
 *
 *     <header class="site-header" id="site-header"></header>
 *     <footer class="site-footer" id="site-footer"></footer>
 *
 * The menu holds only real page destinations (Home and Search Events), so the
 * highlighting rule is simple: the entry whose file name matches the page being
 * viewed is the current one, and exactly one entry is highlighted.
 *
 * The page also supports section links inside the home page (for example the
 * "Talk to our events team" button that jumps to #contact). Those are handled by
 * scrollToHashTarget() below, because the event list is rendered after its API
 * call and the browser's own fragment jump can fire before the layout is final.
 */
import { NAV_ITEMS, HOME_PAGE } from './config.js';
import { el, select } from './dom.js';

const ORG_NAME = 'Unity Heart Foundation';

/** File name of the page currently open, e.g. "search.html". */
function currentPage() {
  const file = window.location.pathname.split('/').pop();
  return file === '' ? HOME_PAGE : file;
}

/**
 * Should this menu entry be highlighted?
 *
 * Every entry names a document, so the test is simply whether that document is
 * the one being viewed. Using the file name rather than the full URL also means
 * an in-page fragment (#contact) does not stop the owning page from being
 * highlighted.
 */
function isCurrentItem(item) {
  return item.href.split('#')[0] === currentPage();
}

/** Build one <a> for the menu, in either the header or the footer. */
function navLink(item, { withActiveState = true } = {}) {
  const link = el('a', {
    className: 'site-nav__link',
    text: item.label,
    attributes: { href: item.href },
  });

  if (withActiveState && isCurrentItem(item)) {
    link.classList.add('site-nav__link--active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

/** Header: brand, menu, and a mobile-friendly menu toggle. */
function buildHeader() {
  const header = el('div', { className: 'site-header__inner' });

  const brand = el('a', {
    className: 'brand',
    attributes: { href: 'index.html', 'aria-label': `${ORG_NAME} home page` },
  });
  brand.innerHTML = `
    <span class="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="34" height="34" role="presentation">
        <circle cx="16" cy="16" r="15" fill="#0f7b6c"></circle>
        <path d="M16 25s-7.4-4.6-9.3-9.1C5.2 12.3 7.4 8.6 11 8.6c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.6 0 5.8 3.7 4.3 7.3C23.4 20.4 16 25 16 25z" fill="#ffffff"></path>
      </svg>
    </span>
    <span class="brand__text">
      <strong>${ORG_NAME}</strong>
      <small>Charity events in your city</small>
    </span>`;

  const nav = el('nav', {
    className: 'site-nav',
    attributes: { id: 'primary-navigation', 'aria-label': 'Main navigation' },
  });

  const list = el('ul', { className: 'site-nav__list' });
  NAV_ITEMS.forEach((item) => {
    const li = el('li');
    li.append(navLink(item));
    list.append(li);
  });
  // NOTE: there is deliberately no separate "call to action" button here.
  // An earlier revision added a "Find an event" button that also pointed at
  // search.html, which duplicated the "Search Events" menu item: two links with
  // identical destinations in the same navigation, one of which carried all the
  // visual weight. The menu alone is enough, keeps each destination unique, and
  // satisfies the brief's "an appropriate menu on all pages" requirement.

  const toggle = el('button', {
    className: 'site-nav__toggle',
    html: '<span class="sr-only">Toggle navigation</span><span aria-hidden="true">&#9776;</span>',
    attributes: {
      type: 'button',
      'aria-controls': 'primary-navigation',
      'aria-expanded': 'false',
    },
  });
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('site-nav--open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.append(list);
  header.append(brand, toggle, nav);
  return header;
}

/** Footer with a dynamic year and a live API status indicator. */
function buildFooter() {
  const inner = el('div', { className: 'site-footer__inner' });

  const about = el('div', { className: 'site-footer__column' });
  about.innerHTML = `
    <h3>${ORG_NAME}</h3>
    <p>Connecting people who care with causes that matter. Every ticket, donation
       and volunteer hour stays in the local community.</p>`;

  const quick = el('div', { className: 'site-footer__column' });
  quick.innerHTML = '<h3>Explore</h3>';
  const quickList = el('ul');
  NAV_ITEMS.forEach((item) => {
    const li = el('li');
    li.append(el('a', { text: item.label, attributes: { href: item.href } }));
    quickList.append(li);
  });
  quick.append(quickList);

  const legal = el('div', { className: 'site-footer__column' });
  legal.innerHTML = `
    <h3>Student project</h3>
    <p>Built for PROG2002 Web Development II, Assessment 2.
       Event details are fictional and for assessment purposes only.</p>`;

  const status = el('p', {
    className: 'site-footer__status',
    attributes: { id: 'api-status', role: 'status' },
    text: 'Checking event server...',
  });

  const bottom = el('div', { className: 'site-footer__bottom' });
  bottom.append(
    el('p', { text: `© ${new Date().getFullYear()} ${ORG_NAME}. All rights reserved.` }),
    status
  );

  inner.append(about, quick, legal);
  const wrapper = el('div');
  wrapper.append(inner, bottom);
  return wrapper;
}

/**
 * Report whether the API is reachable, in the footer.
 * Kept here (not in each page script) so every page shows the same indicator.
 */
async function updateApiStatus() {
  const status = select('#api-status');
  if (!status) return;

  const { getHealth } = await import('./api.js');
  try {
    const health = await getHealth();
    const databaseOk = health && health.database && health.database.connected !== false;
    status.textContent = databaseOk
      ? 'Event server: online'
      : 'Event server: running, database unavailable';
    status.classList.add(databaseOk ? 'is-online' : 'is-warning');
  } catch (error) {
    status.textContent = 'Event server: offline';
    status.classList.add('is-offline');
  }
}

/**
 * Wait until an element exists, or give up after a short delay.
 * The page sections are present immediately, but the event list on the home
 * page is rendered after its API call resolves, so a short wait keeps this
 * robust without blocking.
 */
function waitForElement(selector, timeout = 3000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const found = document.querySelector(selector);
      if (found || Date.now() - startedAt > timeout) {
        clearInterval(timer);
        resolve(found || null);
      }
    }, 50);
  });
}

/**
 * Scroll to the section named in the address bar.
 *
 * The menu itself no longer contains section links, but the home page does (the
 * hero button jumps to the event list and the "Talk to our events team" button
 * jumps to the contact section), and a visitor can also arrive with a fragment
 * already in the URL. Chromium tries to perform that jump while it is still
 * parsing the document, which is unreliable because the event list is rendered
 * after its API call resolves, so the position is applied here instead.
 */
async function scrollToHashTarget() {
  const hash = window.location.hash;
  if (hash.length < 2) return;

  const target = await waitForElement(hash);
  if (!target) return;

  // Instant positioning is used rather than `behavior: 'smooth'`. A smooth
  // animation is cancelled when the document height changes underneath it, and
  // the home page grows every time an event image loads - which left the
  // visitor part way down the page with the requested section still off
  // screen. Reliability matters more than the animation for a jump link.
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'auto', block: 'start' });
  } else if ('scrollY' in window) {
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY);
  }

  // A fragment link should also move the reading position, not only the view.
  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
  }
  if (typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  }
}

/** Called by every page. Creates the menu and footer if the placeholders exist. */
export function initLayout() {
  const headerHost = select('#site-header');
  if (headerHost) headerHost.replaceChildren(buildHeader());

  const footerHost = select('#site-footer');
  if (footerHost) footerHost.replaceChildren(buildFooter());

  updateApiStatus();
  scrollToHashTarget();
}
