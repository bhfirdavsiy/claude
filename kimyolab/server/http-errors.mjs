// Uniform API error semantics (P0.13): every error body is {code,message,requestId}.
export const HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,           // malformed request (invalid JSON, wrong content type)
  UNAUTHORIZED: 401,          // authentication needed
  FORBIDDEN: 403,             // forbidden (e.g. origin not allowed)
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,         // semantically invalid
  RATE_LIMITED: 429,
  INTERNAL: 500,
  BAD_GATEWAY: 502,           // upstream provider failure
  SERVICE_UNAVAILABLE: 503,   // feature not configured on this deployment
});

export class ApiError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const apiError = (status, code, message, headers) => new ApiError(status, code, message, headers);
