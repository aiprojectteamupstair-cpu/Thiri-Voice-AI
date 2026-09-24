import express from 'express';
import path from 'node:path';
import { createThiriApp } from './api/index';

const app = createThiriApp(true);
const port = Number(process.env.PORT) || 3000;

async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.listen(port, '0.0.0.0', () => console.log(`[Thiri Assistant Server] Running on http://0.0.0.0:${port}`));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
