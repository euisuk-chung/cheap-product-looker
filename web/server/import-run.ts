import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectorPayloadSchema } from '../src/lib/schema.ts';
import { loadStore, officialSourceUrl, rebuildSnapshot, saveCandidates, saveObservations, saveRuns } from './store.ts';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: npm run data:import -- <collector-payload.json>');

const payload = collectorPayloadSchema.parse(JSON.parse(await readFile(resolve(inputPath), 'utf8')));
const store = await loadStore();
if (store.runs.some((run) => run.id === payload.run.id)) throw new Error(`Run ${payload.run.id} was already imported.`);

for (const candidate of payload.candidates) {
  if (!store.products.some((product) => product.id === candidate.productId)) throw new Error(`Unknown product for candidate ${candidate.id}`);
  if (!officialSourceUrl(candidate.url, candidate.sourceId, store.sources)) throw new Error(`Candidate URL is not official: ${candidate.url}`);
}

for (const observation of payload.observations) {
  const product = store.products.find((item) => item.id === observation.productId);
  if (!product || product.status !== 'active') throw new Error(`Observation product is not active: ${observation.productId}`);
  if (!product.markets[observation.sourceId]) throw new Error(`No approved ${observation.sourceId} mapping for ${observation.productId}`);
  if (!officialSourceUrl(observation.sourceUrl, observation.sourceId, store.sources)) throw new Error(`Observation URL is not official: ${observation.sourceUrl}`);
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
