/**
 * server.js
 * ---------------------------------------------------------------------------
 * Application entry point.
 *
 * Startup order
 *   1. load configuration (config/env.js reads api/.env)
 *   2. build the Express application
 *   3. mount security middleware, routes and error handling
 *   4. confirm the database connection (mysql mode) and start listening
 *   5. shut down cleanly on Ctrl+C / SIGTERM
 *
 * Run with:  npm start        (api folder)
 */
'use strict';

const express = require('express');
const path = require('path');

const env = require('./src/config/env');
const apiRoutes = require('./src/routes/apiRoutes');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');
const {
  securityHeaders,
  createCors,
  createRateLimiter,
} = require('./src/middleware/security');
const repository = require('./src/repositories');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.set('trust proxy', true); // correct client IPs behind a proxy

app.use(securityHeaders);
app.use(createCors());
app.use(createRateLimiter());

// The API only needs JSON in Assessment 2, but the parser is capped so that
// the POST/PUT/DELETE endpoints added in Assessment 3 cannot be abused.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// A tiny request log so the demo video can show the API being called.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (env.NODE_ENV !== 'test') {
      console.log(
        `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`
      );
    }
  });
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', apiRoutes);

// Friendly landing page so opening http://localhost:3000 in a browser is useful.
app.get('/', (req, res) => {
  res.sendFile(path.join(env.API_ROOT, 'src', 'views', 'api-index.html'), (error) => {
    if (error) {
      res.json({
        success: true,
        meta: { resource: 'api-index' },
        data: { message: 'Charity Events API is running.', try: '/api' },
      });
    }
  });
});

// 404 + central error handling must be registered last.
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  const health = await repository.health();

  console.log('----------------------------------------------------------');
  console.log(' PROG2002 A2 - Charity Events API');
  console.log(` Data source : ${repository.driver}`);
  if (repository.driver === 'mysql') {
    console.log(
      ` Database    : ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT} (user ${env.DB_USER})`
    );
  }
  if (health.connected === false) {
    console.warn(' WARNING: the database is not reachable.');
    console.warn(`   ${health.error ? health.error.message : 'unknown error'}`);
    console.warn('   The API will start, and /api/health will report the problem.');
    console.warn('   Fix: run database/charityevents_db.sql, then check api/.env');
    console.warn('   Or set DATA_SOURCE=local in api/.env to use the offline data.');
  } else {
    console.log(' Database    : connected');
  }
  console.log(` Listening on: http://localhost:${env.PORT}`);
  console.log(` Try         : http://localhost:${env.PORT}/api/events`);
  console.log('----------------------------------------------------------');

  const server = app.listen(env.PORT, () => {
    // started
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received - shutting down.`);
    server.close(async () => {
      try {
        // Safe in both modes: the local data source has nothing to close.
        const db = require('./src/db/event_db');
        await db.close();
      } catch (error) {
        console.warn('Database pool cleanup skipped:', error.message);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start the API:', error);
    process.exit(1);
  });
}

module.exports = { app, start };
