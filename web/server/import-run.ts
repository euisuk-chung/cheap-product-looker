import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectorPayloadSchema } from '../src/lib/schema.ts';
import { loadStore, officialSourceUrl, rebuildSnapshot, saveCandidates, saveObservations, saveRuns } from './store.ts';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: npm run data:import -- <collector-payload.json>');

const payload = collectorPayloadSchema.parse(JSON.parse(await readFile(resolve(inputPath), 'utf8')));
const store = await loadStore();
if (store.runs.some((run) => run.id === payload.run.id)) throw new Error(`Run ${payload.run.id} was already imported.`);

function sameApprovedProduct(approvedUrl: string, observedUrl: string) {
  const approved = new URL(approvedUrl);
  const observed = new URL(observedUrl);
  if (approved.hostname !== observed.hostname || approved.pathname !== observed.pathname) return false;
  for (const key of ['goodsNo', 'itemId', 'vendorItemId']) {
    const expected = approved.searchParams.get(key);
    if (expected && observed.searchParams.get(key) !== expected) return false;
  }
  return true;
}

for (const candidate of payload.candidates) {
  if (candidate.status !== 'pending') throw new Error(`Collector candidates must remain pending: ${candidate.id}`);
  const product = store.products.find((item) => item.id === candidate.productId);
  if (!product) throw new Error(`Unknown product for candidate ${candidate.id}`);
  if (!officialSourceUrl(candidate.url, candidate.sourceId, store.sources)) throw new Error(`Candidate URL is not official: ${candidate.url}`);
  if (candidate.quantityUnit !== product.comparisonUnit) throw new Error(`Candidate unit does not match product ${candidate.id}`);
}

for (const observation of payload.observations) {
  const product = store.products.find((item) => item.id === observation.productId);
  if (!product || product.status !== 'active') throw new Error(`Observation product is not active: ${observation.productId}`);
  const mapping = product.markets[observation.sourceId];
  if (!mapping) throw new Error(`No approved ${observation.sourceId} mapping for ${observation.productId}`);
  if (!officialSourceUrl(observation.sourceUrl, observation.sourceId, store.sources)) throw new Error(`Observation URL is not official: ${observation.sourceUrl}`);
  if (!sameApprovedProduct(mapping.approvedUrl, observation.sourceUrl)) throw new Error(`Observation does not match the approved product URL: ${observation.sourceUrl}`);
  if (observation.quantityUnit !== product.comparisonUnit || observation.quantityUnit !== mapping.quantityUnit || observation.totalQuantity !== mapping.totalQuantity) {
    throw new Error(`Observation quantity does not match the approved package: ${observation.sourceUrl}`);
  }
}

const candidates = [...store.candidates];
for (const incoming of payload.candidates) {
  const index = candidates.findIndex((item) => item.productId === incoming.productId && item.sourceId === incoming.sourceId && item.url === incoming.url);
  if (index >= 0) candidates[index] = { ...incoming, status: candidates[index].status };
  else candidates.push(incoming);
}

await Promise.all([
  saveCandidates(candidates),
  saveObservations([...store.observations, ...payload.observations]),
  saveRuns([...store.runs, payload.run]),
]);
await rebuildSnapshot();
console.log(`Imported run ${payload.run.id}: ${payload.candidates.length} candidates, ${payload.observations.length} observations.`);
