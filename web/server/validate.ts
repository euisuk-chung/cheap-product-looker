import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { loadStore, dataDirectory, makeSnapshot, officialSourceUrl } from './store.ts';
import { latestPricesCsv, productsCsv } from './csv.ts';

const snapshotSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  activeProductCount: z.number().int().nonnegative(),
  pendingProductCount: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  latestSuccessfulRunAt: z.string().datetime({ offset: true }).nullable(),
  sources: z.array(z.unknown()),
  products: z.array(z.unknown()),
  runs: z.array(z.unknown()),
});

const store = await loadStore();
for (const candidate of store.candidates) {
  const product = store.products.find((item) => item.id === candidate.productId);
  if (!product) throw new Error(`Unknown product for candidate ${candidate.id}`);
  if (!officialSourceUrl(candidate.url, candidate.sourceId, store.sources)) throw new Error(`Non-official candidate URL: ${candidate.url}`);
  if (candidate.quantityUnit !== product.comparisonUnit) throw new Error(`Candidate unit does not match product ${candidate.id}`);
}
for (const observation of store.observations) {
  const product = store.products.find((item) => item.id === observation.productId);
  if (!product) throw new Error(`Unknown product for observation ${observation.id}`);
  if (!store.runs.some((run) => run.id === observation.runId)) throw new Error(`Unknown run for observation ${observation.id}`);
  if (!officialSourceUrl(observation.sourceUrl, observation.sourceId, store.sources)) throw new Error(`Non-official observation URL: ${observation.sourceUrl}`);
  if (observation.quantityUnit !== product.comparisonUnit) throw new Error(`Observation unit does not match product ${observation.id}`);
}
const diskSnapshot = snapshotSchema.parse(JSON.parse(await readFile(path.join(dataDirectory, 'snapshot.json'), 'utf8')));
const computed = makeSnapshot(store);
if (diskSnapshot.activeProductCount !== computed.activeProductCount || diskSnapshot.pendingProductCount !== computed.pendingProductCount || diskSnapshot.pendingReviewCount !== computed.pendingReviewCount) {
  throw new Error('snapshot.json is stale. Run npm run data:rebuild.');
}
const [diskProductsCsv, diskLatestPricesCsv] = await Promise.all([
  readFile(path.join(dataDirectory, 'products.csv'), 'utf8'),
  readFile(path.join(dataDirectory, 'latest-prices.csv'), 'utf8'),
]);
const normalizeNewlines = (value: string) => value.replace(/\r\n/g, '\n');
if (normalizeNewlines(diskProductsCsv) !== normalizeNewlines(productsCsv(store.products))) throw new Error('products.csv is stale. Run npm run data:rebuild.');
if (normalizeNewlines(diskLatestPricesCsv) !== normalizeNewlines(latestPricesCsv(computed))) throw new Error('latest-prices.csv is stale. Run npm run data:rebuild.');
console.log(`Validated ${store.products.length} products, ${store.candidates.length} candidates, ${store.observations.length} observations, and ${store.runs.length} runs.`);
