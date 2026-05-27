'use strict';

/**
 * Thrown when a defense explicitly blocks a request.
 * HTTP callers should map this to 403.
 */
class BlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedError';
    this.status = 403; // Forbidden
  }
}

/**
 * Thrown when the level configuration is invalid or references an
 * unknown defense.
 * HTTP callers should map this to 500.
 */
class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.status = 500; // Internal Server Error
  }
}

class UrlError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UrlError';
        this.status = 400; // Bad Request
    }
}

module.exports = { BlockedError, ConfigError, UrlError };