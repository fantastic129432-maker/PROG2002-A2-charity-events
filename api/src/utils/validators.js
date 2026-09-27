/**
 * src/utils/validators.js
 * ---------------------------------------------------------------------------
 * Reusable parsing and validation helpers for query strings.
 *
 * Query values always arrive as strings (or arrays of strings), so every value
 * has to be parsed and checked before it reaches the database. These helpers
 * are used by the service layer, which turns a problem into an HttpError(400)
 * with a clear message the client can display next to the form field.
 */
'use strict';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

/** Read a query parameter that may legitimately appear more than once. */
function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Split repeated parameters and comma separated values into a clean list of
 * ids. This is what allows the client to send either
 *   ?category=1&category=2      (repeated)
 *   ?category=1,2               (comma separated)
 *   ?category[]=1&category[]=2  (PHP style brackets)
 */
function parseIdList(value, fieldName, errors) {
  const raw = asArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter((item) => item !== '');

  const ids = [];
  for (const item of raw) {
    const number = Number(item);
    if (!Number.isInteger(number) || number <= 0) {
      errors.push({
        field: fieldName,
        message: `"${item}" is not a valid ${fieldName} id.`,
      });
      continue;
    }
    if (!ids.includes(number)) ids.push(number);
  }
  return ids;
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return false;
  const [hours, minutes, seconds = '00'] = value.split(':');
  return Number(hours) < 24 && Number(minutes) < 60 && Number(seconds) < 60;
}

/** Parse a positive integer with a bounded range. */
function parseInteger(value, fieldName, { min = 1, max = Number.MAX_SAFE_INTEGER, errors }) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    errors.push({ field: fieldName, message: `"${value}" is not a whole number.` });
    return undefined;
  }
  if (number < min || number > max) {
    errors.push({
      field: fieldName,
      message: `Must be between ${min} and ${max}.`,
    });
    return undefined;
  }
  return number;
}

/** Read a single trimmed string, treating "" as absent. */
function parseText(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(Array.isArray(value) ? value[0] : value).trim();
  return text === '' ? undefined : text;
}

module.exports = {
  asArray,
  parseIdList,
  parseInteger,
  parseText,
  isValidDate,
  isValidTime,
  DATE_PATTERN,
  TIME_PATTERN,
};
