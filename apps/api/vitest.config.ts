import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vitest doesn't auto-load .env files — pull them in via Vite's loadEnv
  // (see CLAUDE.md). Loads .env, .env.local, .env.[mode], etc. from this
  // directory and exposes every key (not just VITE_-prefixed ones) on
  // process.env for the test runner.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    test: {
      environment: 'node',
      globals: false,
      include: ['tests/**/*.test.ts'],
      // Integration tests hit a live API server on :3000 and a real Supabase
      // project — give them room, and run files sequentially so seeded test
      // data from different files/tenants doesn't collide.
      testTimeout: 20_000,
      hookTimeout: 30_000,
      fileParallelism: false,
    },
  };
});
