import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';
import { ErrorCode } from '@lineup/types';
import { apiError } from './errors.js';

/**
 * Wraps zValidator so validation failures return the project-wide error
 * shape `{ error: { code: 'validation_error', message } }` with a 400.
 */
export function jsonValidator<T extends ZodSchema>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw apiError(400, ErrorCode.VALIDATION, result.error.issues.map((i) => i.message).join('; '));
    }
  });
}

export function queryValidator<T extends ZodSchema>(schema: T) {
  return zValidator('query', schema, (result) => {
    if (!result.success) {
      throw apiError(400, ErrorCode.VALIDATION, result.error.issues.map((i) => i.message).join('; '));
    }
  });
}
