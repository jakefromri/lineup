import { handle } from 'hono/vercel';
import app from '../src/app.js';

export const config = { api: { bodyParser: false } };

export default handle(app);
