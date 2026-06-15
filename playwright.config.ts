import { defineConfig } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/health';
const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

// E2E suite exercises the admin app (manager + superadmin), the parent-facing
// web app, and the API together. Per CLAUDE.md, the API needs a real (dev)
// Supabase project and .env before any of this can run — see apps/api/.env.example.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev --workspace=apps/api',
      url: API_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev --workspace=apps/admin',
      url: ADMIN_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev --workspace=apps/web',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
