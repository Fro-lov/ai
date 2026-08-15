export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Invalid request') {
    super('VALIDATION_ERROR', message, 400);
    this.name = 'ValidationError';
  }
}

export class ProviderNotFoundError extends AppError {
  constructor(providerName: string) {
    super('PROVIDER_NOT_FOUND', `AI provider '${providerName}' not found`, 404);
    this.name = 'ProviderNotFoundError';
  }
}

export class AIProviderError extends AppError {
  constructor(message: string = 'AI provider error') {
    super('AI_PROVIDER_ERROR', message, 502);
    this.name = 'AIProviderError';
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
  }
}
