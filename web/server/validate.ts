import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { loadStore, dataDirectory, makeSnapshot, officialSourceUrl } from './store.ts';
import { latestPricesCsv, productsCsv } from './csv.ts';

const snapshotSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  activeProductCount: z.number().int().nonnegative(),
  pendingProductCount: z.number().int().nonnegative(),
  latestSuccessfulRunAt: z.string().datetime({ offset: true }).nullable(),
  sources: z.array(z.unknown()),
  products: z.array(z.unknown()),
  runs: z.array(z.unknown()),
});

const store = await loadStore();
for (const candidate of store.candidates) {
  if (!store.products.some((product) => product.id === candidate.productId)) throw new Error(`Unknown product for candidate ${candidate.id}`);
  if (!officialSourceUrl(candidate.url, candidate.sourceId, store.sources)) throw new Error(`Non-official candidate URL: ${candidate.url}`);
}
for (const observation of store.observations) {
  if (!store.products.some((product) => product.id === observation.productId)) throw new Error(`Unknown product for observation ${observation.id}`);
  if (!store.runs.some((run) => run.id === observation.runId)) throw new Error(`Unknown run for observation ${observation.id}`);
  if (!officialSourceUrl(observation.sourceUrl, observation.sourceId, store.sources)) throw new Error(`Non-official observation URL: ${observation.sourceUrl}`);
}
const diskSnapshot = snapshotSchema.parse(JSON.parse(await readFile(path.join(dataDirectory, 'snapshot.json'), 'utf8')));
const computed = makeSnapshot(store);
if (diskSnapshot.activeProductCount !== computed.activeProductCount || diskSnapshot.pendingProductCount !== computed.pendingProductCount) {
  throw new Error('snapshot.json is stale. Run npm run data:rebuild.');
}
const [diskProductsCsv, diskLatestPricesCsv] = await Promise.all([
  readFile(path.join(dataDirectory, 'products.csv'), 'utf8'),
  readFile(path.join(dataDirectory, 'latest-prices.csv'), 'utf8'),
]);
if (diskProductsCsv !== productsCsv(store.products)) throw new Error('products.csv is stale. Run npm run data:rebuild.');
if (diskLatestPricesCsv !== latestPricesCsv(computed)) throw new Error('latest-prices.csv is stale. Run npm run data:rebuild.');
console.log(`Validated ${store.products.length} products, ${store.candidates.length} candidates, ${store.observations.length} observations, and ${store.runs.length} runs.`);
