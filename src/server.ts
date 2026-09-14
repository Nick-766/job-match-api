import { createApp } from './app';
import { InMemoryStore } from './storage/memory';
import { PostgresStore } from './storage/postgres';
import type { Store } from './storage/store';

const PORT = Number(process.env.PORT ?? 3000);

/** Postgres when DATABASE_URL is set (docker-compose), in-memory otherwise. */
function createStore(): Store {
  const url = process.env.DATABASE_URL;
  if (url) {
    console.log('Using Postgres storage');
    return new PostgresStore(url);
  }
  console.log('Using in-memory storage (set DATABASE_URL to use Postgres)');
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
