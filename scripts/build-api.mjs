import { build } from 'esbuild';

// Empacota a function serverless num único arquivo JS autocontido (mantendo
// só os pacotes de node_modules como externos). A Vercel só transpila o
// arquivo de entrada de uma function, não os módulos locais que ele importa
// com extensão .ts explícita — então em vez de depender disso, geramos
// api/index.js pronto e o commitamos: é o único arquivo que existe em api/,
// sem fonte .ts nenhuma ali para causar ambiguidade.
await build({
  entryPoints: ['server/serverless.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  allowOverwrite: true,
});
