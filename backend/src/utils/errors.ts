/**
 * Custom error classes for better error handling and flow control
 */

/**
 * Base class for application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 409 Conflict error (e.g., duplicate resources)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409);
  }
}

/**
 * 401 Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * 400 Bad Request error
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}
