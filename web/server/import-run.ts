import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectorPayloadSchema } from '../src/lib/schema.ts';
import { loadStore, officialSourceUrl, rebuildSnapshot, saveCandidates, saveObservations, saveProducts, saveRuns } from './store.ts';

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
  if (candidate.reviewStatus !== 'pending') throw new Error(`Collector candidates must be unreviewed before the review step: ${candidate.id}`);
  const product = store.products.find((item) => item.id === candidate.productId);
  if (!product) throw new Error(`Unknown product for candidate ${candidate.id}`);
  if (!officialSourceUrl(candidate.url, candidate.sourceId, store.sources)) throw new Error(`Candidate URL is not official: ${candidate.url}`);
  if (candidate.quantityUnit !== product.comparisonUnit) throw new Error(`Candidate unit does not match product ${candidate.id}`);
}

if (!payload.run.reviewResult || payload.run.reviewResult.reviewedCount !== payload.reviews.length || payload.run.reviewResult.passedCount !== payload.reviews.filter((review) => review.decision === 'passed').length) {
  throw new Error('CollectionRun reviewResult does not match the review decisions.');
}

const candidates = [...store.candidates];
const candidateAliases = new Map<string, string>();
for (const incoming of payload.candidates) {
  const index = candidates.findIndex((item) => item.productId === incoming.productId && item.sourceId === incoming.sourceId && item.url === incoming.url);
  if (index >= 0) {
    candidateAliases.set(incoming.id, candidates[index].id);
    candidates[index] = { ...incoming, id: candidates[index].id, status: candidates[index].status };
  } else {
    candidateAliases.set(incoming.id, incoming.id);
    candidates.push(incoming);
  }
}

const reviewedCandidateIds = new Set<string>();
for (const review of payload.reviews) {
  const candidateId = candidateAliases.get(review.candidateId);
  if (!candidateId) throw new Error(`Review target was not collected in this run: ${review.candidateId}`);
  if (reviewedCandidateIds.has(candidateId)) throw new Error(`Candidate was reviewed more than once: ${candidateId}`);
  reviewedCandidateIds.add(candidateId);
  const index = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) throw new Error(`Unknown review candidate: ${candidateId}`);
  candidates[index] = {
    ...candidates[index],
    reviewStatus: review.decision,
    reviewedAt: review.reviewedAt,
    reviewedBy: review.reviewer,
    reviewReason: review.reason,
    status: review.decision === 'failed' ? 'rejected' : candidates[index].status,
  };
}

let products = [...store.products];
const reviewedGroups = new Set(payload.reviews.map((review) => {
  const candidate = candidates.find((item) => item.id === candidateAliases.get(review.candidateId));
  if (!candidate) throw new Error(`Unknown reviewed candidate: ${review.candidateId}`);
  return `${candidate.productId}:${candidate.sourceId}`;
}));

for (const group of reviewedGroups) {
  const [productId, sourceId] = group.split(':');
  const eligible = candidates.filter((candidate) => candidate.productId === productId && candidate.sourceId === sourceId && reviewedCandidateIds.has(candidate.id) && candidate.reviewStatus === 'passed' && candidate.stockStatus === 'in_stock' && candidate.observedPrice !== null && candidate.shippingFee !== null);
  if (!eligible.length) continue;
  eligible.sort((left, right) => ((left.observedPrice as number) + (left.shippingFee as number)) / left.totalQuantity - ((right.observedPrice as number) + (right.shippingFee as number)) / right.totalQuantity);
  const selected = eligible[0];
  candidates.splice(0, candidates.length, ...candidates.map((candidate) => candidate.productId === productId && candidate.sourceId === sourceId ? { ...candidate, status: candidate.id === selected.id ? 'approved' as const : candidate.status === 'approved' ? 'pending' as const : candidate.status } : candidate));
  products = products.map((product) => {
    if (product.id !== productId) return product;
    const markets = { ...product.markets, [sourceId]: {
      sourceId: selected.sourceId,
      approvedUrl: selected.url,
      productTitle: selected.title,
      seller: selected.seller,
      packageDescription: selected.packageDescription,
      totalQuantity: selected.totalQuantity,
      quantityUnit: selected.quantityUnit,
      approvedAt: selected.reviewedAt as string,
    } };
    return { ...product, markets, status: store.sources.every((source) => Boolean(markets[source.id])) ? 'active' as const : 'pending' as const, updatedAt: selected.reviewedAt as string };
  });
}

for (const observation of payload.observations) {
  const product = products.find((item) => item.id === observation.productId);
  if (!product || product.status !== 'active') throw new Error(`Observation product is not active: ${observation.productId}`);
  const mapping = product.markets[observation.sourceId];
  const reviewedCandidate = candidates.find((candidate) => candidate.productId === observation.productId && candidate.sourceId === observation.sourceId && sameApprovedProduct(candidate.url, observation.sourceUrl) && reviewedCandidateIds.has(candidate.id) && candidate.reviewStatus === 'passed');
  if (!mapping || !reviewedCandidate) throw new Error(`Observation was not selected by the review agent: ${observation.sourceUrl}`);
  if (!officialSourceUrl(observation.sourceUrl, observation.sourceId, store.sources)) throw new Error(`Observation URL is not official: ${observation.sourceUrl}`);
  if (!sameApprovedProduct(mapping.approvedUrl, observation.sourceUrl)) throw new Error(`Observation does not match the reviewed mapping: ${observation.sourceUrl}`);
  if (observation.quantityUnit !== product.comparisonUnit || observation.quantityUnit !== mapping.quantityUnit || observation.totalQuantity !== mapping.totalQuantity) throw new Error(`Observation quantity does not match the reviewed package: ${observation.sourceUrl}`);
}

await Promise.all([
  saveCandidates(candidates),
  saveProducts(products),
  saveObservations([...store.observations, ...payload.observations]),
  saveRuns([...store.runs, payload.run]),
]);
await rebuildSnapshot();
console.log(`Imported run ${payload.run.id}: ${payload.candidates.length} candidates, ${payload.observations.length} observations.`);
