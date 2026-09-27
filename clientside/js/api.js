/**
 * js/api.js
 * ---------------------------------------------------------------------------
 * The single point in the client that talks to the REST API.
 *
 * Everything is built on fetch(), which returns a Promise - the brief asks for
 * Promises, and `async/await` is simply a cleaner way to read the same thing.
 * Centralising the calls here means:
 *   * the API base URL is defined once (config.js),
 *   * every failure produces the same ApiError object, so the pages can show
 *     one consistent error message,
 *   * a slow or dead API cannot freeze the page (10 second timeout).
 */
import { API_BASE_URL } from './config.js';

/** Error type thrown by every function in this module. */
export class ApiError extends Error {
  constructor(message, { status = 0, details = null, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.url = url;
  }

  /** A message that is safe and helpful to display to a member of the public. */
  get friendlyMessage() {
    if (this.status === 404) {
      return this.message || 'That event could not be found.';
    }
    if (this.status === 400) {
      return 'Some of the details you entered were not valid. Please check the form.';
    }
    if (this.status === 429) {
      return 'Too many requests were sent. Please wait a moment and try again.';
    }
    if (this.status >= 500) {
      return 'The server had a problem loading this information. Please try again shortly.';
    }
    return 'Could not reach the charity events server. Check that the API is running and try again.';
  }
}

/** Build a query string, dropping empty values and expanding arrays. */
export function buildQueryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value
        .filter((item) => item !== undefined && item !== null && item !== '')
        .forEach((item) => search.append(key, item));
      return;
    }
    search.append(key, value);
  });

  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Perform a GET request and return the `data` part of the API envelope.
 *
 * @param {string} path    e.g. '/events/1'
 * @param {object} params  query parameters
 */
export async function getJson(path, params = {}) {
  const url = `${API_BASE_URL}${path}${buildQueryString(params)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new ApiError('The request took too long and was cancelled.', { url });
    }
    throw new ApiError('Could not reach the charity events server.', { url });
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    // A non-JSON body means something other than our API answered.
    body = null;
  }

  if (!response.ok || (body && body.success === false)) {
    const apiError = body && body.error ? body.error : {};
    throw new ApiError(apiError.message || `Request failed (${response.status}).`, {
      status: response.status,
      details: apiError.details || null,
      url,
    });
  }

  return body ? body.data : null;
}

/**
 * GET /api/events - the workhorse behind both the home page and the search
 * page. `params` may contain category (array), location (array), city, date,
 * from, to, state, keyword, isFree, sort, direction, limit, offset, page.
 */
export function getEvents(params = {}) {
  return getJson('/events', params);
}

/** GET /api/events/upcoming - current and upcoming events, soonest first. */
export function getUpcomingEvents(params = {}) {
  return getJson('/events/upcoming', params);
}

/** GET /api/events/:id - full detail including ticket tiers and progress. */
export function getEventById(eventId) {
  return getJson(`/events/${encodeURIComponent(eventId)}`);
}

/** GET /api/categories - category filter options. */
export function getCategories() {
  return getJson('/categories');
}

/** GET /api/locations - location filter options. */
export function getLocations() {
  return getJson('/locations');
}

/** GET /api/stats - headline numbers for the home page. */
export function getStats() {
  return getJson('/stats');
}

/** GET /api/organization - the organisation featured on the home page. */
export function getOrganization() {
  return getJson('/organization');
}

/** GET /api/health - used by the footer to show whether the API is online. */
export function getHealth() {
  return getJson('/health');
}
