export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ProviderNotFoundError extends AppError {
  constructor(providerName: string) {
    super(`Provider not found: ${providerName}`, 'PROVIDER_NOT_FOUND', 404);
  }
}

export class AIProviderError extends AppError {
  constructor(message: string) {
    super(message, 'AI_PROVIDER_ERROR', 502);
  }
}

export class InternalError extends AppError {
  constructor(message: string) {
    super(message, 'INTERNAL_ERROR', 500);
    this.name = 'InternalError';
  }
}
