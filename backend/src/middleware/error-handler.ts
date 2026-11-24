/**
 * Centralised error handling. Every error in the app ends up here and is
 * returned in one consistent JSON shape:
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...], "requestId": "..." } }
 *
 * Internal errors are logged in full but returned without stack traces or
 * internal messages, so implementation details never leak to clients.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Errors raised by Express' JSON body parser carry a `type` and `status`. */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export function createErrorHandler(options: {
  exposeInternalErrors: boolean;
}): ErrorRequestHandler {
  // Express recognises error handlers by their four parameters, so `_next` must stay
  return (err: unknown, req, res, _next) => {
    let status = 500;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };

    if (err instanceof AppError) {
      status = err.status;
      body = { code: err.code, message: err.message };
      if (err.details !== undefined) body.details = err.details;
    } else if (err instanceof ZodError) {
      status = 400;
      body = {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      };
    } else if (isBodyParserError(err, 'entity.parse.failed')) {
      status = 400;
      body = { code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
    } else if (isBodyParserError(err, 'entity.too.large')) {
      status = 413;
      body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    } else if (options.exposeInternalErrors && err instanceof Error) {
      body.message = err.message; // development only – helps debugging
    }

    // Unexpected errors (5xx) are logged with the full error; client errors as warnings
    if (status >= 500) req.log?.error({ err }, 'Unhandled error');
    else req.log?.warn({ code: body.code, status }, body.message);

    const requestId = typeof req.id === 'string' ? req.id : undefined;
    if (requestId) body.requestId = requestId;
    res.status(status).json({ error: body });
  };
}

function isBodyParserError(err: unknown, type: string): err is BodyParserError {
  return err instanceof Error && (err as BodyParserError).type === type;
}
