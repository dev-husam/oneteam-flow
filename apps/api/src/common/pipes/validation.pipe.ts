import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';

interface FieldIssue {
  field: string;
  rules: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldIssue[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, rules: Object.keys(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/**
 * Strict global validation: unknown properties are rejected (mass-assignment protection).
 * Details carry rule names, not English sentences, so clients can localize.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => new AppError('VALIDATION_FAILED', { fields: flatten(errors) }),
  });
}
