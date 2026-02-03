export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, "BAD_REQUEST", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error") {
    super(500, "INTERNAL_ERROR", message);
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class RetryableProviderError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, true, cause);
    this.name = "RetryableProviderError";
  }
}

export class FatalProviderError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, false, cause);
    this.name = "FatalProviderError";
  }
}
