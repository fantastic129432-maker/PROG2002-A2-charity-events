/**
 * src/repositories/repository.mysql.js
 * ---------------------------------------------------------------------------
 * The submission data source: every question the API asks the database is
 * written here as one parameterised MySQL statement, built against the views
 * created in database/01_schema.sql.
 *
 * Two rules are applied consistently:
 *   1. Only rows with status = 'active' are ever publicly visible. This is
 *      guaranteed by vw_public_events, so a suspended event cannot leak out
 *      through an endpoint that is added later.
 *   2. upcoming / ongoing / past are DERIVED from date_start and date_end
 *      compared with CURDATE(); they are never stored, so the website stays
 *      correct without a nightly job.
 *
 * `q` is a short alias for event_db.query().
 */
'use strict';

const env = require('../config/env');
const db = require('../db/event_db');
const q = db;

/** Column list shared by the list and detail queries. */
const EVENT_COLUMNS = `
  e.event_id            AS eventId,
  e.event_name          AS eventName,
  e.short_description   AS shortDescription,
  e.description         AS description,
  e.purpose             AS purpose,
  e.event_date          AS eventDate,
  e.start_time          AS startTime,
  e.end_time            AS endTime,
  e.date_start          AS dateStart,
  e.date_end            AS dateEnd,
  e.goal_amount         AS goalAmount,
  e.is_free             AS isFree,
  e.capacity            AS capacity,
  e.image_url           AS imageUrl,
  e.organization_id     AS organizationId,
  e.organization_name   AS organizationName,
  e.category_id         AS categoryId,
  e.category_name       AS categoryName,
  e.category_slug       AS categorySlug,
  e.location_id         AS locationId,
  e.venue_name          AS venueName,
  e.address             AS address,
  e.city                AS city,
  e.state               AS state,
  e.postcode            AS postcode,
  e.raised_amount       AS raisedAmount,
  e.progress_percent    AS progressPercent,
  e.donation_count      AS donationCount,
  e.event_state         AS eventState`;

/** Cheapest ticket price, used on the home/search cards. */
const PRIMARY_PRICE = `
  (SELECT MIN(t.price)
     FROM ticket_types t
    WHERE t.event_id = e.event_id)                       AS primaryPrice`;

/**
 * Build the WHERE / HAVING fragment used by every event listing.
 *
 * All user input is bound through `params`; even the sort column is
 * whitelisted rather than interpolated into the SQL text.
 *
 * @param {object} filters  normalised filters from eventService
 * @returns {{where:string, having:string, params:Array}}
 */
function buildEventFilter(filters = {}) {
  const params = [];
  const conditions = [];

  if (filters.categoryIds && filters.categoryIds.length > 0) {
    const placeholders = filters.categoryIds.map(() => '?').join(', ');
    conditions.push(`e.category_id IN (${placeholders})`);
    params.push(...filters.categoryIds);
  }

  if (filters.locationIds && filters.locationIds.length > 0) {
    const placeholders = filters.locationIds.map(() => '?').join(', ');
    conditions.push(`e.location_id IN (${placeholders})`);
    params.push(...filters.locationIds);
  }

  if (filters.city) {
    conditions.push('e.city LIKE ?');
    params.push(`%${filters.city}%`);
  }

  if (filters.from) {
    conditions.push('e.date_end >= ?');
    params.push(filters.from);
  }

  if (filters.to) {
    conditions.push('e.date_start <= ?');
    params.push(filters.to);
  }

  if (filters.isFree === true) {
    conditions.push('e.is_free = 1');
  } else if (filters.isFree === false) {
    conditions.push('e.is_free = 0');
  }

  if (filters.keyword) {
    conditions.push(
      `(e.event_name LIKE ? OR e.short_description LIKE ? OR
        e.city LIKE ? OR e.venue_name LIKE ? OR e.organization_name LIKE ?)`
    );
    const like = `%${filters.keyword}%`;
    params.push(like, like, like, like, like);
  }

  if (filters.organizationId) {
    conditions.push('e.organization_id = ?');
    params.push(filters.organizationId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // The three public states. 'upcoming' in the UI means "not finished yet",
  // which also covers an event running today, so ongoing folds into it.
  let having = '';
  if (filters.state === 'past') {
    having = 'HAVING eventState = ?';
    params.push('past');
  } else if (
    filters.state === 'upcoming' ||
    filters.state === 'ongoing' ||
    filters.excludePast
  ) {
    having = 'HAVING eventState <> ?';
    params.push('past');
  }

  return { where, having, params };
}

/** Whitelist of sortable columns - prevents SQL injection through ?sort=. */
const SORT_COLUMNS = {
  date: 'dateStart',
  name: 'eventName',
  goal: 'goalAmount',
  progress: 'progressPercent',
  category: 'categoryName',
  city: 'city',
};

/** Turn a requested sort key/direction into safe SQL. */
function buildOrderBy(sort, direction, defaultSort = 'date', defaultDir = 'ASC') {
  const column = SORT_COLUMNS[sort] || SORT_COLUMNS[defaultSort];
  const dir = String(direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${dir}, eventId ASC`;
}

/** Shared normalisation so both repositories return identical field types. */
function normaliseEvent(row) {
  if (!row) return null;
  return {
    ...row,
    isFree: Boolean(row.isFree),
    goalAmount: Number(row.goalAmount || 0),
    raisedAmount: Number(row.raisedAmount || 0),
    progressPercent: Number(row.progressPercent || 0),
    donationCount: Number(row.donationCount || 0),
    primaryPrice:
      row.primaryPrice === null || row.primaryPrice === undefined
        ? null
        : Number(row.primaryPrice),
  };
}

/**
 * Wrap the filtered event query in a derived table so the API can page the
 * result and count the total using exactly the same filters.
 *
 * A derived table (rather than a CTE) is used so the statement also runs on
 * MySQL 5.7 and on MariaDB.
 */
function buildFilteredSubquery(filters, orderBy) {
  const { where, having, params } = buildEventFilter(filters);
  const sql = `
    SELECT ${EVENT_COLUMNS}, ${PRIMARY_PRICE}
      FROM vw_public_events e
      ${where}
      ${having}
      ${orderBy}`;
  return { sql, params };
}

const repository = {
  driver: 'mysql',

  /** Does the database answer, and do the tables exist? */
  async health() {
    return db.ping();
  },

  /**
   * Home page + search page listing.
   * @param {object} filters  normalised filters from eventService
   * @param {{limit:number, offset:number, sort:string, direction:string}} paging
   */
  async findEvents(filters, paging) {
    const orderBy = buildOrderBy(paging.sort, paging.direction, 'date', 'ASC');
    const { sql: filteredSql, params } = buildFilteredSubquery(filters, orderBy);

    const rows = await q.query(
      `SELECT *
         FROM (${filteredSql}) AS ordered
        LIMIT ? OFFSET ?`,
      [...params, paging.limit, paging.offset]
    );

    const countRows = await q.query(
      `SELECT COUNT(*) AS total
         FROM (${filteredSql}) AS matched`,
      params
    );

    return {
      total: countRows[0] ? Number(countRows[0].total) : 0,
      events: rows.map(normaliseEvent),
    };
  },

  /** Full details for one event, including its ticket tiers. */
  async findEventById(eventId) {
    const rows = await q.query(
      `SELECT ${EVENT_COLUMNS}, ${PRIMARY_PRICE}
         FROM vw_public_events e
        WHERE e.event_id = ?`,
      [eventId]
    );
    if (rows.length === 0) return null;

    const event = normaliseEvent(rows[0]);

    const tickets = await q.query(
      `SELECT ticket_type_id      AS ticketTypeId,
              ticket_name         AS ticketName,
              price               AS price,
              quantity_available  AS quantityAvailable,
              description         AS description
         FROM ticket_types
        WHERE event_id = ?
        ORDER BY price ASC, ticket_name ASC`,
      [eventId]
    );

    event.ticketTypes = tickets.map((ticket) => ({
      ...ticket,
      price: Number(ticket.price),
      quantityAvailable:
        ticket.quantityAvailable === null
          ? null
          : Number(ticket.quantityAvailable),
    }));

    // How many days remain until the event starts (negative once it is past).
    const days = await q.query(
      'SELECT DATEDIFF(date_start, CURDATE()) AS daysUntil FROM events WHERE event_id = ?',
      [eventId]
    );
    event.daysUntil = days[0] ? Number(days[0].daysUntil) : null;

    return event;
  },

  /** All categories with a count of how many active events use each one. */
  async findCategories() {
    const rows = await q.query(
      `SELECT c.category_id      AS categoryId,
              c.category_name    AS categoryName,
              c.slug             AS slug,
              c.description      AS description,
              c.icon             AS icon,
              COUNT(e.event_id)  AS eventCount
         FROM categories c
         LEFT JOIN vw_public_events e ON e.category_id = c.category_id
        GROUP BY c.category_id, c.category_name, c.slug, c.description, c.icon
        ORDER BY c.category_name ASC`
    );
    return rows.map((row) => ({
      ...row,
      eventCount: Number(row.eventCount),
      categoryId: Number(row.categoryId),
    }));
  },

  /** Distinct venues that currently host at least one public event. */
  async findLocations() {
    const rows = await q.query(
      `SELECT l.location_id     AS locationId,
              l.venue_name      AS venueName,
              l.city            AS city,
              l.state           AS state,
              COUNT(e.event_id) AS eventCount
         FROM locations l
         JOIN vw_public_events e ON e.location_id = l.location_id
        GROUP BY l.location_id, l.venue_name, l.city, l.state
        ORDER BY l.city ASC, l.venue_name ASC`
    );
    return rows.map((row) => ({
      ...row,
      locationId: Number(row.locationId),
      eventCount: Number(row.eventCount),
    }));
  },

  /** The organisation featured on the home page. */
  async findFeaturedOrganization() {
    const rows = await q.query(
      `SELECT organization_id  AS organizationId,
              name             AS name,
              mission          AS mission,
              email            AS email,
              phone            AS phone,
              website          AS website,
              city             AS city,
              country          AS country
         FROM organizations
        ORDER BY organization_id ASC
        LIMIT 1`
    );
    return rows[0] || null;
  },

  /** Headline numbers for the home page statistics strip. */
  async findStats() {
    const rows = await q.query(
      `SELECT
          (SELECT COUNT(*) FROM vw_public_events WHERE event_state <> 'past') AS upcomingEvents,
          (SELECT COUNT(*) FROM categories)                                   AS categories,
          (SELECT COUNT(*) FROM organizations)                                AS organizations,
          (SELECT COALESCE(SUM(raised_amount), 0) FROM vw_public_events)      AS totalRaised,
          (SELECT COALESCE(SUM(goal_amount), 0)
             FROM vw_public_events WHERE event_state <> 'past')               AS activeGoal`
    );
    const stats = rows[0] || {};
    return {
      upcomingEvents: Number(stats.upcomingEvents || 0),
      categories: Number(stats.categories || 0),
      organizations: Number(stats.organizations || 0),
      totalRaised: Number(stats.totalRaised || 0),
      activeGoal: Number(stats.activeGoal || 0),
      defaultPageSize: env.DEFAULT_PAGE_SIZE,
    };
  },
};

module.exports = repository;
module.exports.buildEventFilter = buildEventFilter;
module.exports.buildOrderBy = buildOrderBy;
module.exports.normaliseEvent = normaliseEvent;
module.exports.SORT_COLUMNS = SORT_COLUMNS;
module.exports.EVENT_COLUMNS = EVENT_COLUMNS;
module.exports.PRIMARY_PRICE = PRIMARY_PRICE;
