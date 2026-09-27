/**
 * src/services/eventService.js
 * ---------------------------------------------------------------------------
 * The only place where query-string text becomes a validated filter object.
 *
 * Why a service layer? The controller stays thin (HTTP in, JSON out) and the
 * repository stays purely about data, which means the same validation rules
 * apply no matter which repository implementation is active, and the rules can
 * be unit tested without starting a web server.
 */
'use strict';

const env = require('../config/env');
const repository = require('../repositories');
const { HttpError } = require('../utils/errors');
const {
  parseIdList,
  parseInteger,
  parseText,
  isValidDate,
} = require('../utils/validators');

const ALLOWED_STATES = ['upcoming', 'ongoing', 'past', 'all'];
const ALLOWED_SORTS = ['date', 'name', 'goal', 'progress', 'category', 'city'];

/**
 * Turn raw req.query into { filters, paging } or throw HttpError(400).
 *
 * Supported parameters
 *   category, categoryId  one or many ids (repeat the key or use commas)
 *   location, locationId  one or many location ids
 *   city                  partial city name
 *   date                  a single day (YYYY-MM-DD)
 *   from, to              a date range (YYYY-MM-DD, inclusive)
 *   state                 upcoming | ongoing | past | all
 *   keyword               free text search
 *   organizationId        restrict to one organisation
 *   isFree                true | false
 *   includePast           true | false (used by the home page)
 *   sort, direction       whitelisted sort keys
 *   limit, offset, page   pagination
 */
function buildQuery(query = {}) {
  const errors = [];

  const categoryIds = [
    ...parseIdList(query.category, 'category', errors),
    ...parseIdList(query.categoryId, 'categoryId', errors),
  ];
  const locationIds = [
    ...parseIdList(query.location, 'location', errors),
    ...parseIdList(query.locationId, 'locationId', errors),
  ];
  const uniqueCategories = [...new Set(categoryIds)];
  const uniqueLocations = [...new Set(locationIds)];

  let from = parseText(query.from);
  let to = parseText(query.to);
  const singleDate = parseText(query.date);

  if (singleDate) {
    if (!isValidDate(singleDate)) {
      errors.push({
        field: 'date',
        message: 'Date must be a real calendar date in YYYY-MM-DD format.',
      });
    } else {
      from = singleDate;
      to = singleDate;
    }
  }

  if (from && !isValidDate(from)) {
    errors.push({ field: 'from', message: 'From date must be YYYY-MM-DD.' });
  }
  if (to && !isValidDate(to)) {
    errors.push({ field: 'to', message: 'To date must be YYYY-MM-DD.' });
  }
  if (from && to && isValidDate(from) && isValidDate(to) && to < from) {
    errors.push({
      field: 'to',
      message: 'The end of the range cannot be earlier than the start.',
    });
  }

  const state = parseText(query.state) || 'upcoming';
  if (!ALLOWED_STATES.includes(state)) {
    errors.push({
      field: 'state',
      message: `State must be one of: ${ALLOWED_STATES.join(', ')}.`,
    });
  }
  // ?includePast=true is a convenience alias for ?state=all, so the home page
  // can ask for the full history if it ever needs to.
  const includePastAlias = parseText(query.includePast) === 'true';

  const sort = parseText(query.sort) || 'date';
  if (!ALLOWED_SORTS.includes(sort)) {
    errors.push({
      field: 'sort',
      message: `Sort must be one of: ${ALLOWED_SORTS.join(', ')}.`,
    });
  }

  const direction = (parseText(query.direction) || 'asc').toLowerCase();
  if (!['asc', 'desc'].includes(direction)) {
    errors.push({ field: 'direction', message: 'Direction must be asc or desc.' });
  }

  let isFree;
  const freeText = parseText(query.isFree);
  if (freeText !== undefined) {
    if (freeText === 'true') isFree = true;
    else if (freeText === 'false') isFree = false;
    else errors.push({ field: 'isFree', message: 'isFree must be true or false.' });
  }

  let includePast = false;  const includePastText = parseText(query.includePast);
  if (includePastText !== undefined) {
    if (includePastText === 'true') includePast = true;
    else if (includePastText === 'false') includePast = false;
    else
      errors.push({
        field: 'includePast',
        message: 'includePast must be true or false.',
      });
  }

  const effectiveState = includePastAlias && state === 'upcoming' ? 'all' : state;

  const limit =
    query.limit === undefined
      ? env.DEFAULT_PAGE_SIZE
      : parseInteger(query.limit, 'limit', { min: 1, max: env.MAX_PAGE_SIZE, errors });

  let offset = 0;
  const pageText = parseText(query.page);
  if (pageText !== undefined) {
    const page = parseInteger(pageText, 'page', { min: 1, max: 10_000, errors });
    if (page !== undefined && limit !== undefined) offset = (page - 1) * limit;
  }
  const offsetText = parseText(query.offset);
  if (offsetText !== undefined) {
    const parsed = parseInteger(offsetText, 'offset', { min: 0, max: 1_000_000, errors });
    if (parsed !== undefined) offset = parsed;
  }

  if (errors.length > 0) {
    throw HttpError.badRequest('One or more query parameters are invalid.', errors);
  }

  const organizationId = parseText(query.organizationId);

  return {
    filters: {
      categoryIds: uniqueCategories,
      locationIds: uniqueLocations,
      city: parseText(query.city),
      from,
      to,
      state: effectiveState,
      sort,
      direction,
      isFree,
      includePast,
      keyword: parseText(query.keyword),
      organizationId: organizationId ? Number(organizationId) : undefined,
      // `state` is the single source of truth for the derived past/upcoming
      // filter: 'past' shows history, 'all' shows everything, and the default
      // 'upcoming' shows only events that have not finished yet.
      excludePast: effectiveState === 'upcoming',
    },
    paging: {
      limit: limit === undefined ? env.DEFAULT_PAGE_SIZE : limit,
      offset,
      page: Math.floor(offset / (limit || env.DEFAULT_PAGE_SIZE)) + 1,
      sort,
      direction,
    },
  };
}

/** List events (home page and search page both use this). */
async function searchEvents(query) {
  const { filters, paging } = buildQuery(query);
  const result = await repository.findEvents(filters, paging);

  return {
    total: result.total,
    count: result.events.length,
    limit: paging.limit,
    offset: paging.offset,
    page: paging.page,
    totalPages: Math.max(Math.ceil(result.total / paging.limit), 1),
    appliedFilters: describeFilters(filters),
    events: result.events,
  };
}

/** Listing for the home page: everything that has not finished yet. */
async function listActiveEvents(query = {}) {
  return searchEvents({ ...query, state: 'upcoming' });
}

/**
 * One event plus its tickets.
 * @throws {HttpError} 400 when the id is not a positive whole number
 * @throws {HttpError} 404 when no active event has that id
 */
async function getEventById(rawId) {
  const eventId = Number(rawId);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw HttpError.badRequest(
      `"${rawId}" is not a valid event id. Event ids are positive whole numbers.`
    );
  }

  const event = await repository.findEventById(eventId);
  if (!event) {
    throw HttpError.notFound(
      `No active charity event was found with id ${eventId}. It may have been suspended or removed.`
    );
  }
  return event;
}

/** Category list for the search page filter. */
async function listCategories() {
  return repository.findCategories();
}

/** Location list for the search page filter. */
async function listLocations() {
  return repository.findLocations();
}

/** The organisation shown on the home page. */
async function getFeaturedOrganization() {
  return repository.findFeaturedOrganization();
}

/** Numbers for the home page statistics strip. */
async function getStats() {
  return repository.findStats();
}

/** Echo back what was actually applied, for the "no results" message. */
function describeFilters(filters) {
  const applied = {};
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    applied.categoryIds = filters.categoryIds;
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    applied.locationIds = filters.locationIds;
  }
  if (filters.city) applied.city = filters.city;
  if (filters.from) applied.from = filters.from;
  if (filters.to) applied.to = filters.to;
  if (filters.keyword) applied.keyword = filters.keyword;
  if (typeof filters.isFree === 'boolean') applied.isFree = filters.isFree;
  if (filters.organizationId) applied.organizationId = filters.organizationId;
  applied.state = filters.state;
  return applied;
}

module.exports = {
  buildQuery,
  searchEvents,
  listActiveEvents,
  getEventById,
  listCategories,
  listLocations,
  getFeaturedOrganization,
  getStats,
  describeFilters,
};
