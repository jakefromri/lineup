import { readFileSync } from 'fs';
import { join } from 'path';

export default function globalSetup() {
  // Playwright runs from the repo root and doesn't auto-load workspace .env
  // files. Parse apps/api/.env so e2e helpers can reach Supabase directly.
  const envPath = join(process.cwd(), 'apps/api/.env');
  try {
    const contents = readFileSync(envPath, 'utf-8');
    for (const line of contents.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env missing — tests will fail with a clear message from helpers.ts
  }
}
