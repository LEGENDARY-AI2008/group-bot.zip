import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cleanNumber,
  requestPairing,
  getStatus,
  restoreAll,
  sessionCount,
} from './src/sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(express.json({ limit: '2kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory rate limit: 5 code requests per IP per 10 minutes
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= 5) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

app.post('/api/pair', async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
  }
  const number = cleanNumber(req.body?.number);
  if (!number) {
    return res.status(400).json({ error: 'Enter your number with country code, e.g. 2348012345678.' });
  }
  try {
    const code = await requestPairing(number);
    const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    res.json({ code: pretty });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not get a code. Try again.' });
  }
});

app.get('/api/status', (req, res) => {
  const number = cleanNumber(req.query.number);
  if (!number) return res.status(400).json({ error: 'Invalid number.' });
  res.json({ status: getStatus(number) });
});

app.get('/health', (_req, res) => res.json({ ok: true, sessions: sessionCount() }));

app.listen(PORT, async () => {
  console.log(`Pairing site running on port ${PORT}`);
  await restoreAll();
});
