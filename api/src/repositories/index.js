/**
 * src/repositories/index.js
 * ---------------------------------------------------------------------------
 * Chooses the data source once, at start-up, based on DATA_SOURCE in .env.
 *
 *   DATA_SOURCE=mysql  (default, submitted configuration) -> MySQL database
 *   DATA_SOURCE=local                                     -> offline mirror
 *
 * The rest of the application only ever imports this module, so swapping the
 * data source never touches a route, controller or service.
 */
'use strict';

const env = require('../config/env');

const mysqlRepository = require('./repository.mysql');
const localRepository = require('./repository.local');

const repository = env.DATA_SOURCE === 'local' ? localRepository : mysqlRepository;

if (env.DATA_SOURCE !== 'mysql' && env.DATA_SOURCE !== 'local') {
  console.warn(
    `[repositories] Unknown DATA_SOURCE "${env.DATA_SOURCE}" - falling back to mysql.`
  );
}

module.exports = repository;
module.exports.driver = repository.driver;
