import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorCodeValue } from '@lineup/types';

/**
 * Builds an HTTPException whose body matches the project-wide error shape:
 * `{ error: { code, message } }`.
 */
export function apiError(status: ContentfulStatusCode, code: ErrorCodeValue, message: string): HTTPException {
  return new HTTPException(status, {
    message: JSON.stringify({ error: { code, message } }),
  });
}
