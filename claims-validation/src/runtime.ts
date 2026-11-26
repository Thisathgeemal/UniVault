/**
 * The runtime helpers that standalone validator code (standaloneValidatorsModule) needs in the
 * browser: the SAME format implementations (ajv-formats' full formats: date, email, …) and
 * Ajv's Unicode-aware string length that the backend's runtime-compiled validators use.
 */
import * as formatsModule from 'ajv-formats/dist/formats.js';
import * as ucs2lengthModule from 'ajv/dist/runtime/ucs2length.js';

type Ucs2length = (str: string) => number;

// Both files are CommonJS. Node puts module.exports on `default`; bundlers expose the
// exports directly (and `default` = exports.default). Accept either shape.
const ucs2Default = (ucs2lengthModule as unknown as { default: unknown }).default;
export const ucs2length: Ucs2length =
  typeof ucs2Default === 'function'
    ? (ucs2Default as Ucs2length)
    : (ucs2Default as { default: Ucs2length }).default;

const formatsNs = formatsModule as unknown as {
  fullFormats?: Record<string, unknown>;
  default?: { fullFormats: Record<string, unknown> };
};
export const formats: Record<string, unknown> =
  formatsNs.fullFormats ?? formatsNs.default!.fullFormats;
