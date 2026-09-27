/**
 * js/config.js
 * ---------------------------------------------------------------------------
 * One place that knows where the API lives, so the same client code can be
 * pointed at a different API without editing any other file.
 *
 * If you run the API on a different port, change API_BASE_URL here only.
 */
export const API_BASE_URL = 'http://localhost:3000/api';

/** Where the generated category images live. */
export const IMAGE_BASE_URL = './images/';

/** Shown when an event has no usable image. */
export const FALLBACK_IMAGE = 'fun-run.svg';

/** How many events the home page asks for. */
export const HOME_EVENT_LIMIT = 12;

/** The page that carries the organisation's own sections (about, contact). */
export const HOME_PAGE = 'index.html';

/**
 * Nav items used by js/nav.js on every page.
 *
 * `labelKey` is looked up in js/translations.js rather than holding the text
 * itself, so the menu follows the language switcher. The English wording also
 * lives in the HTML, which keeps a page readable before the script runs.
 *
 * The menu only contains real destinations that are always reachable. The home
 * page still has its About and Contact sections, but they are deliberately not
 * linked from the menu: a fragment link has to be rewritten depending on which
 * page the visitor is on (a bare #about only works on the home page), and that
 * extra conditional behaviour caused more problems than the links were worth.
 */
export const NAV_ITEMS = [
  { href: HOME_PAGE, labelKey: 'nav.home' },
  { href: 'search.html', labelKey: 'nav.search' },
];
