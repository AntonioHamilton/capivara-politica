try {
  process.loadEnvFile();
} catch {
  // sem arquivo .env (ex.: produção, onde as variáveis já vêm do ambiente)
}
