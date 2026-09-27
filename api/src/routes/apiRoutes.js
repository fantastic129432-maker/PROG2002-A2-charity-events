/**
 * src/routes/apiRoutes.js
 * ---------------------------------------------------------------------------
 * The public RESTful surface of the API.
 *
 * URL design principles applied:
 *   * nouns, not verbs            -> /api/events, not /api/getEvents
 *   * the collection is filtered with query parameters rather than a
 *     different path per filter    -> /api/events?city=Lismore&category=1
 *   * a single resource is addressed by id  -> /api/events/7
 *   * fixed sub-resources come before the :id route so that "upcoming" is
 *     never mistaken for an event id
 *   * every route is a safe, cacheable GET for Assessment 2
 */
'use strict';

const express = require('express');
const eventController = require('../controllers/eventController');
const categoryController = require('../controllers/categoryController');
const repository = require('../repositories');
const env = require('../config/env');

const router = express.Router();

/**
 * GET /api/health
 * Confirms that the API is running and, when DATA_SOURCE=mysql, that the
 * database answers. Handy first check for the marker or the demo video.
 */
router.get('/health', async (req, res) => {
  const database = await repository.health();
  const healthy = database.connected !== false;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    meta: {
      resource: 'health',
      dataSource: repository.driver,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    },
    data: {
      api: 'ok',
      database,
    },
  });
});

/**
 * GET /api
 * A machine readable directory of the API. This doubles as living
 * documentation during the demonstration.
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    meta: { resource: 'api-index', dataSource: repository.driver },
    data: {
      name: 'Charity Events API',
      version: '1.0.0',
      assessment: 'PROG2002 Assessment 2',
      endpoints: [
        {
          method: 'GET',
          path: '/api/health',
          description: 'Service and database health check.',
        },
        {
          method: 'GET',
          path: '/api/events',
          description:
            'Filtered list of active charity events. Home page and search page.',
          queryParameters:
            'category, location, city, date, from, to, state, keyword, isFree, organizationId, sort, direction, limit, offset, page',
        },
        {
          method: 'GET',
          path: '/api/events/upcoming',
          description: 'Convenience view: current and upcoming events, soonest first.',
        },
        {
          method: 'GET',
          path: '/api/events/:id',
          description: 'Full detail for one event, including ticket tiers and progress.',
        },
        {
          method: 'GET',
          path: '/api/categories',
          description: 'All event categories with an active event count.',
        },
        {
          method: 'GET',
          path: '/api/locations',
          description: 'Venues that currently host at least one active event.',
        },
        {
          method: 'GET',
          path: '/api/organization',
          description: 'The charitable organisation featured on the home page.',
        },
        {
          method: 'GET',
          path: '/api/stats',
          description: 'Headline counts and totals for the home page.',
        },
      ],
    },
  });
});

// Reference data (declared before /events/:id on purpose - a different
// resource path, but keeping fixed paths first avoids any ambiguity).
router.get('/categories', categoryController.getCategories);
router.get('/locations', categoryController.getLocations);

// Events
router.get('/events', eventController.getEvents);
router.get('/events/upcoming', eventController.getUpcomingEvents);
router.get('/events/:id', eventController.getEventById);

// Home page extras
router.get('/organization', eventController.getFeaturedOrganization);
router.get('/stats', eventController.getStats);

module.exports = router;
