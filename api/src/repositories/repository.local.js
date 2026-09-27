/**
 * src/repositories/repository.local.js
 * ---------------------------------------------------------------------------
 * Offline twin of repository.mysql.js.
 *
 * It exposes exactly the same methods and returns exactly the same object
 * shapes, but the rows come from local-data.js (a generated mirror of
 * database/02_seed.sql) instead of MySQL. It exists so the website can be run,
 * demonstrated and marked on a computer that has no MySQL server, and so the
 * API logic can be tested in isolation.
 *
 * The MySQL version is the submitted data source. Nothing in the case study
 * rules is changed here: suspended events are still hidden, and
 * upcoming/ongoing/past are still derived from the dates rather than stored.
 */
'use strict';

const env = require('../config/env');
const data = require('./local-data');

/**
 * "Today" for the derived event state.
 * DATA_SOURCE=local + DEMO_TODAY=2026-09-28 makes the demo reproducible; when
 * DEMO_TODAY is not set the real current date is used, matching CURDATE().
 */
function today() {
  const override = process.env.DEMO_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Date().toISOString().slice(0, 10);
}

/** upcoming | ongoing | past - the same rule as vw_public_events. */
function eventState(row, currentDate = today()) {
  if (row.date_end < currentDate) return 'past';
  if (row.date_start <= currentDate) return 'ongoing';
  return 'upcoming';
}

function byId(collection, key, value) {
  return collection.find((row) => row[key] === value) || null;
}

function daysBetween(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Join the ticket tiers and donation totals for one event. */
function decorate(row) {
  const organization = byId(data.organizations, 'organization_id', row.organization_id);
  const category = byId(data.categories, 'category_id', row.category_id);
  const location = byId(data.locations, 'location_id', row.location_id);
  const tickets = data.ticket_types.filter((t) => t.event_id === row.event_id);
  const gifts = data.donations.filter((d) => d.event_id === row.event_id);

  const raisedAmount = Number(
    gifts.reduce((sum, gift) => sum + Number(gift.amount), 0).toFixed(2)
  );
  const goalAmount = Number(row.goal_amount || 0);
  const prices = tickets.map((t) => Number(t.price));

  return {
    eventId: row.event_id,
    eventName: row.event_name,
    shortDescription: row.short_description,
    description: row.description,
    purpose: row.purpose,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    goalAmount,
    isFree: Boolean(row.is_free),
    capacity: row.capacity === null ? null : Number(row.capacity),
    imageUrl: row.image_url,
    status: row.status,
    organizationId: row.organization_id,
    organizationName: organization ? organization.name : null,
    categoryId: row.category_id,
    categoryName: category ? category.category_name : null,
    categorySlug: category ? category.slug : null,
    locationId: row.location_id,
    venueName: location ? location.venue_name : null,
    address: location ? location.address : null,
    city: location ? location.city : null,
    state: location ? location.state : null,
    postcode: location ? location.postcode : null,
    raisedAmount,
    progressPercent:
      goalAmount > 0
        ? Math.min(Number(((raisedAmount / goalAmount) * 100).toFixed(1)), 100)
        : 0,
    donationCount: gifts.length,
    eventState: eventState(row),
    primaryPrice: prices.length > 0 ? Math.min(...prices) : null,
    ticketTypes: tickets
      .slice()
      .sort((a, b) => Number(a.price) - Number(b.price))
      .map((ticket) => ({
        ticketTypeId: ticket.ticket_type_id,
        ticketName: ticket.ticket_name,
        price: Number(ticket.price),
        quantityAvailable:
          ticket.quantity_available === null ? null : Number(ticket.quantity_available),
        description: ticket.description,
      })),
  };
}

/** Public events only: status = 'active' is what vw_public_events enforces. */
function publicEvents() {
  return data.events.filter((row) => row.status === 'active').map(decorate);
}

function matches(event, filters) {
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    if (!filters.categoryIds.includes(Number(event.categoryId))) return false;
  }

  if (filters.locationIds && filters.locationIds.length > 0) {
    if (!filters.locationIds.includes(Number(event.locationId))) return false;
  }

  if (filters.city) {
    const needle = filters.city.toLowerCase();
    if (!String(event.city).toLowerCase().includes(needle)) return false;
  }

  if (filters.from && event.dateEnd < filters.from) return false;
  if (filters.to && event.dateStart > filters.to) return false;

  if (filters.isFree === true && !event.isFree) return false;
  if (filters.isFree === false && event.isFree) return false;

  if (filters.organizationId && Number(event.organizationId) !== Number(filters.organizationId)) {
    return false;
  }

  if (filters.keyword) {
    const needle = filters.keyword.toLowerCase();
    const haystack = [
      event.eventName,
      event.shortDescription,
      event.city,
      event.venueName,
      event.organizationName,
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (filters.state === 'past' && event.eventState !== 'past') return false;
  if (
    (filters.state === 'upcoming' ||
      filters.state === 'ongoing' ||
      filters.excludePast) &&
    event.eventState === 'past'
  ) {
    return false;
  }

  return true;
}

const SORT_KEYS = {
  date: 'dateStart',
  name: 'eventName',
  goal: 'goalAmount',
  progress: 'progressPercent',
  category: 'categoryName',
  city: 'city',
};

function sortEvents(events, sort, direction, defaultSort = 'date', defaultDir = 'ASC') {
  const key = SORT_KEYS[sort] || SORT_KEYS[defaultSort];
  const dir = String(direction).toLowerCase() === 'desc' ? -1 : 1;

  return events.slice().sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left === right) return a.eventId - b.eventId;
    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * dir;
    }
    return String(left).localeCompare(String(right)) * dir;
  });
}

const repository = {
  driver: 'local',

  async health() {
    return {
      connected: true,
      driver: 'local',
      database: `${env.DB_NAME} (in-memory mirror of database/02_seed.sql)`,
      serverVersion: 'n/a',
      tableCount: 6,
      host: 'local',
      user: 'local',
      note:
        'DATA_SOURCE=local. Set DATA_SOURCE=mysql in api/.env to read from MySQL.',
      demoToday: today(),
    };
  },

  async findEvents(filters, paging) {
    const matched = publicEvents().filter((event) => matches(event, filters));
    const sorted = sortEvents(matched, paging.sort, paging.direction, 'date', 'ASC');
    const page = sorted.slice(paging.offset, paging.offset + paging.limit);
    return { total: sorted.length, events: page };
  },

  async findEventById(eventId) {
    const event = publicEvents().find((row) => row.eventId === Number(eventId));
    if (!event) return null;
    return {
      ...event,
      daysUntil: daysBetween(today(), event.dateStart),
    };
  },

  async findCategories() {
    const events = publicEvents();
    return data.categories
      .map((category) => ({
        categoryId: category.category_id,
        categoryName: category.category_name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        eventCount: events.filter((e) => e.categoryId === category.category_id).length,
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  },

  async findLocations() {
    const events = publicEvents();
    return data.locations
      .map((location) => ({
        locationId: location.location_id,
        venueName: location.venue_name,
        city: location.city,
        state: location.state,
        eventCount: events.filter((e) => e.locationId === location.location_id).length,
      }))
      .filter((location) => location.eventCount > 0)
      .sort(
        (a, b) =>
          a.city.localeCompare(b.city) || a.venueName.localeCompare(b.venueName)
      );
  },

  async findFeaturedOrganization() {
    const organization = data.organizations[0];
    if (!organization) return null;
    return {
      organizationId: organization.organization_id,
      name: organization.name,
      mission: organization.mission,
      email: organization.email,
      phone: organization.phone,
      website: organization.website,
      city: organization.city,
      country: organization.country,
    };
  },

  async findStats() {
    const events = publicEvents();
    const active = events.filter((e) => e.eventState !== 'past');
    return {
      upcomingEvents: active.length,
      categories: data.categories.length,
      organizations: data.organizations.length,
      totalRaised: Number(
        events.reduce((sum, e) => sum + e.raisedAmount, 0).toFixed(2)
      ),
      activeGoal: active.reduce((sum, e) => sum + e.goalAmount, 0),
      defaultPageSize: env.DEFAULT_PAGE_SIZE,
    };
  },
};

module.exports = repository;
module.exports.decorate = decorate;
module.exports.eventState = eventState;
module.exports.today = today;
