import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { assertProductionDatabaseConfigured } from './src/db/index';
import { createApiApp } from './src/server/app';
import { verifyDatabaseConnectionAndSchema } from './src/server/repository';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  assertProductionDatabaseConfigured();
  const dbCheck = await verifyDatabaseConnectionAndSchema();
  const app = createApiApp();

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Production bundle not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Saucy Culture server listening on http://localhost:${PORT} (storage: ${dbCheck.mode})`
    );
  });
}

startServer().catch((err) => {
  console.error('FATAL server startup error:', err);
  process.exit(1);
});
