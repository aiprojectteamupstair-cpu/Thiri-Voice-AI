import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createThiriApp } from './api/index';

const app = createThiriApp(true);
const port = Number(process.env.PORT) || 3003;
const companionPort = Number(process.env.THIRI_COMPANION_PORT) || 3004;
const pairingToken = randomBytes(24).toString('base64url');
const companion = createThiriApp(true, {
  token: pairingToken,
  allowedOrigin: process.env.THIRI_ALLOWED_ORIGIN || 'https://thiri-voice-ai.vercel.app',
});

app.get('/api/local/pairing', async (req, res) => {
  const address = req.socket.remoteAddress || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
    res.status(403).json({ error: 'Pairing is available only on this computer.' });
    return;
  }
  const log = await readFile(path.resolve(process.cwd(), '.local-tools', 'tunnel.log'), 'utf8').catch(() => '');
  const tunnelUrl = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] || process.env.THIRI_COMPANION_URL || '';
  res.json({ code: pairingToken, localUrl: `http://127.0.0.1:${companionPort}`, tunnelUrl });
});

async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.listen(port, '127.0.0.1', () => console.log(`[Thiri Assistant Server] Running on http://127.0.0.1:${port}`));
  companion.listen(companionPort, '127.0.0.1', () => console.log(`[Thiri Companion] Pairing API on http://127.0.0.1:${companionPort}`));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
