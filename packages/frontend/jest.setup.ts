import { webcrypto } from 'node:crypto';

// jsdom does not expose the Web Crypto subtle API, which the shared
// provably-fair helpers depend on. Backfill it from Node's implementation.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

// jsdom does not provide TextEncoder/TextDecoder globals either.
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('node:util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

import '@testing-library/jest-dom';
