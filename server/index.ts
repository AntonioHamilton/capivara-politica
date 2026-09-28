import { createServer as createViteServer } from 'vite';
import { exec } from 'node:child_process';
import path from 'node:path';
import { app } from './app.ts';
import { dataDir } from './db.ts';

const PORT = Number(process.env.PORT ?? 4310);

const vite = await createViteServer({
  root: path.resolve(import.meta.dirname, '..'),
  server: { middlewareMode: true },
  appType: 'spa',
});
app.use(vite.middlewares);

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Capivara Política rodando em ${url}  (dados em ${dataDir})`);
  if (process.platform === 'win32' && !process.env.NO_OPEN) exec(`start "" ${url}`);
});
