import { createApp } from './app';
import { InMemoryStore } from './storage/memory';
import type { Store } from './storage/store';

const PORT = Number(process.env.PORT ?? 3000);

function createStore(): Store {
  return new InMemoryStore();
}

async function main() {
  const store = createStore();
  await store.init();

  const app = createApp(store);
  const server = app.listen(PORT, () => {
    console.log(`Job Match API listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
