/**
 * Request validation with zod.
 *
 *   router.post('/credentials', validate({ body: issueCredentialSchema }), handler)
 *
 * Invalid requests never reach the handler: a ZodError is passed to the
 * central error handler, which returns 400 VALIDATION_ERROR with field details.
 * Parsed (typed, defaulted, stripped) values are stored in res.locals.validated.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export interface ValidatedRequestData {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated: ValidatedRequestData = {};
      if (schemas.params) validated.params = schemas.params.parse(req.params);
      if (schemas.query) validated.query = schemas.query.parse(req.query);
      if (schemas.body) validated.body = schemas.body.parse(req.body ?? {});
      res.locals.validated = validated;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Typed access to validated data inside a handler. */
export function getValidated<T extends ValidatedRequestData>(res: Response): T {
  return res.locals.validated as T;
}
