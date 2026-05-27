'use strict';

/**
 * Lightweight in-process key-value store for per-level runtime state.
 *
 * Data is intentionally not persisted across restarts so that e.g. the
 * random port for level_6 is regenerated each time the server starts.
 *
 * Usage:
 *   state.set('level_6', 'internalPort', 51234);
 *   state.get('level_6', 'internalPort'); // → 51234
 */

const _store = {};

function get(level, key) {
  return _store[level]?.[key]; // ?. -> if _store[level] is 'null' or 'undefined' return 'undefined' without evaluating 'key'
}

function set(level, key, value) {
  if (!_store[level]) _store[level] = {};
  _store[level][key] = value;
}

module.exports = { get, set };