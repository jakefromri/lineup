import { serve } from '@hono/node-server';
import app from './app.js';

const port = parseInt(process.env.PORT ?? '3000');

serve({ fetch: app.fetch, port }, () => {
  console.log(`API running on http://localhost:${port}`);
});

export default app;
