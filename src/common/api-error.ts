/** Application error with an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthorized = (): ApiError =>
  new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid API key');
export const forbidden = (): ApiError =>
  new ApiError(403, 'FORBIDDEN', 'API key scope does not allow this operation');
// Used both for missing resources and for resources the caller may not see (BOLA).
export const notFound = (what: string): ApiError =>
  new ApiError(404, 'NOT_FOUND', `${what} not found`);
