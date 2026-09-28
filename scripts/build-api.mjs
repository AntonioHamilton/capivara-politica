import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

// Empacota a function serverless num único arquivo JS autocontido (mantendo
// só os pacotes de node_modules como externos). Evita depender do bundler da
// Vercel resolver corretamente os módulos .ts locais em runtime.
await build({
  entryPoints: ['api/index.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  allowOverwrite: true,
});

// Remove as fontes .ts pra não ficarem ambíguas ao lado do .js gerado
// (a Vercel trataria os dois como rotas separadas pra /api).
await rm('api/index.ts');
await rm('api/_lib', { recursive: true, force: true });
