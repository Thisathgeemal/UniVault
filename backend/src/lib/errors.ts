/**
 * Application errors with an HTTP status and a stable machine-readable code.
 * Route handlers throw these; the central error handler turns them into the
 * standard error response:  { "error": { "code", "message", "details"?, "requestId" } }
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);

/** For endpoints whose route exists but whose logic arrives in a later sprint. */
export const notImplemented = (plannedFor: string) =>
  new AppError(501, 'NOT_IMPLEMENTED', `This endpoint is planned for ${plannedFor}`);
