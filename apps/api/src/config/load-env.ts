import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the repository-root .env for local development. Imported first by every entrypoint.
 * Production injects real environment variables, so no file is read there.
 */
if (process.env.NODE_ENV !== 'production') {
  const file = resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
