import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  candidatesSchema,
  observationSchema,
  observationsSchema,
  productsSchema,
  runSchema,
  runsSchema,
  sourcesSchema,
  type CollectionRun,
  type MarketCandidate,
  type PriceObservation,
  type Product,
  type PublicSnapshot,
  type Source,
  type SourceId,
} from '../src/lib/schema.ts';
import { latestPricesCsv, productsCsv } from './csv.ts';

export const dataDirectory = fileURLToPath(new URL('../public/data/', import.meta.url));

const files = {
  sources: path.join(dataDirectory, 'sources.json'),
  products: path.join(dataDirectory, 'products.json'),
  candidates: path.join(dataDirectory, 'candidates.json'),
  observations: path.join(dataDirectory, 'observations.jsonl'),
  runs: path.join(dataDirectory, 'runs.jsonl'),
  snapshot: path.join(dataDirectory, 'snapshot.json'),
  productsCsv: path.join(dataDirectory, 'products.csv'),
  latestPricesCsv: path.join(dataDirectory, 'latest-prices.csv'),
};

async function readJson<T>(filePath: string, parser: { parse: (value: unknown) => T }): Promise<T> {
  return parser.parse(JSON.parse(await readFile(filePath, 'utf8')));
}

async function readJsonLines<T>(filePath: string, parser: { parse: (value: unknown) => T }): Promise<T[]> {
  const content = await readFile(filePath, 'utf8');
  if (!content.trim()) return [];
  return content.trim().split(/\r?\n/).map((line) => parser.parse(JSON.parse(line)));
}

async function writeAtomic(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function loadStore() {
  const [sources, products, candidates, observations, runs] = await Promise.all([
    readJson(files.sources, sourcesSchema),
    readJson(files.products, productsSchema),
    readJson(files.candidates, candidatesSchema),
    readJsonLines(files.observations, observationSchema),
    readJsonLines(files.runs, runSchema),
  ]);
  return { sources, products, candidates, observations, runs };
}

export async function saveProducts(products: Product[]) {
  const valid = productsSchema.parse(products);
  await Promise.all([
    writeAtomic(files.products, `${JSON.stringify(valid, null, 2)}\n`),
    writeAtomic(files.productsCsv, productsCsv(valid)),
  ]);
}

export async function saveCandidates(candidates: MarketCandidate[]) {
  await writeAtomic(files.candidates, `${JSON.stringify(candidatesSchema.parse(candidates), null, 2)}\n`);
}

export async function saveObservations(observations: PriceObservation[]) {
  const valid = observationsSchema.parse(observations);
  await writeAtomic(files.observations, valid.map((item) => JSON.stringify(item)).join('\n') + (valid.length ? '\n' : ''));
}

export async function saveRuns(runs: CollectionRun[]) {
  const valid = runsSchema.parse(runs);
  await writeAtomic(files.runs, valid.map((item) => JSON.stringify(item)).join('\n') + (valid.length ? '\n' : ''));
}

function latestBySource(observations: PriceObservation[]) {
  const latest: Partial<Record<SourceId, PriceObservation & { isFresh: boolean }>> = {};
  const staleAfter = 36 * 60 * 60 * 1000;
  for (const observation of observations.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    latest[observation.sourceId] = {
      ...observation,
      isFresh: Date.now() - Date.parse(observation.capturedAt) <= staleAfter,
    };
  }
  return latest;
}

export function makeSnapshot(input: {
  sources: Source[];
  products: Product[];
  candidates: MarketCandidate[];
  observations: PriceObservation[];
  runs: CollectionRun[];
}): PublicSnapshot {
  const activeProducts = input.products.filter((product) => product.status === 'active');
  const products = activeProducts.map((product) => {
    const history = input.observations.filter((item) => item.productId === product.id);
    const latest = latestBySource(history);
    const comparable = Object.values(latest).filter((item) => item?.isFresh && item.comparable && item.stockStatus === 'in_stock' && item.unitPrice !== null && item.quantityUnit === product.comparisonUnit);
    const minimum = comparable.length ? Math.min(...comparable.map((item) => item.unitPrice as number)) : null;
    const winnerSourceIds = minimum === null ? [] : comparable.filter((item) => item.unitPrice === minimum).map((item) => item.sourceId);
    const observationPurchases = Object.values(latest).filter((item) => item?.comparable && item.stockStatus === 'in_stock' && item.totalPrice !== null && item.unitPrice !== null && item.quantityUnit === product.comparisonUnit).map((item) => ({
      sourceId: item.sourceId, url: item.sourceUrl, totalPrice: item.totalPrice as number, unitPrice: item.unitPrice as number,
      quantityUnit: item.quantityUnit, checkedAt: item.capturedAt, isFresh: item.isFresh, basis: 'observation' as const,
    }));
    const candidatePurchases = input.candidates.filter((candidate) => candidate.productId === product.id && candidate.status === 'approved' && product.markets[candidate.sourceId]?.approvedUrl === candidate.url && candidate.stockStatus === 'in_stock' && candidate.observedPrice !== null && candidate.shippingFee !== null && candidate.quantityUnit === product.comparisonUnit).map((candidate) => ({
      sourceId: candidate.sourceId, url: candidate.url, totalPrice: (candidate.observedPrice as number) + (candidate.shippingFee as number), unitPrice: ((candidate.observedPrice as number) + (candidate.shippingFee as number)) / candidate.totalQuantity,
      quantityUnit: candidate.quantityUnit, checkedAt: candidate.reviewedAt ?? candidate.discoveredAt, isFresh: Date.now() - Date.parse(candidate.reviewedAt ?? candidate.discoveredAt) <= 36 * 60 * 60 * 1000, basis: 'candidate' as const,
    }));
    const purchasePool = observationPurchases.some((item) => item.isFresh) ? observationPurchases.filter((item) => item.isFresh) : observationPurchases.length ? observationPurchases : candidatePurchases;
    const bestPurchase = purchasePool.sort((left, right) => left.unitPrice - right.unitPrice)[0] ?? null;
    const imageObservation = history.filter((item) => item.imageUrl).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt)).at(-1);
    const imageCandidate = input.candidates.filter((candidate) => candidate.productId === product.id && candidate.imageUrl && candidate.status === 'approved' && product.markets[candidate.sourceId]?.approvedUrl === candidate.url).sort((left, right) => (left.reviewedAt ?? left.discoveredAt).localeCompare(right.reviewedAt ?? right.discoveredAt)).at(-1);
    const displayImage = imageObservation?.imageUrl ? {
      imageUrl: imageObservation.imageUrl,
      productUrl: imageObservation.sourceUrl,
      sourceId: imageObservation.sourceId,
      checkedAt: imageObservation.capturedAt,
      basis: 'observation' as const,
    } : imageCandidate?.imageUrl ? {
      imageUrl: imageCandidate.imageUrl,
      productUrl: imageCandidate.url,
      sourceId: imageCandidate.sourceId,
      checkedAt: imageCandidate.reviewedAt ?? imageCandidate.discoveredAt,
      basis: 'candidate' as const,
    } : null;
    return { ...product, latestBySource: latest, winnerSourceIds, history, bestPurchase, displayImage };
  });
  const successfulRuns = input.runs.filter((run) => run.sourceResults.some((result) => result.status === 'succeeded'));
  return {
    generatedAt: new Date().toISOString(),
    activeProductCount: activeProducts.length,
    pendingProductCount: input.products.filter((product) => product.status === 'pending').length,
    pendingReviewCount: input.candidates.filter((candidate) => candidate.reviewStatus === 'pending' && candidate.status !== 'rejected').length,
    latestSuccessfulRunAt: successfulRuns.at(-1)?.finishedAt ?? null,
    sources: input.sources,
    products,
    runs: input.runs.slice(-10).reverse(),
  };
}

export async function rebuildSnapshot() {
  const store = await loadStore();
  const snapshot = makeSnapshot(store);
  await Promise.all([
    writeAtomic(files.snapshot, `${JSON.stringify(snapshot, null, 2)}\n`),
    writeAtomic(files.productsCsv, productsCsv(store.products)),
    writeAtomic(files.latestPricesCsv, latestPricesCsv(snapshot)),
  ]);
  return snapshot;
}

export function officialSourceUrl(url: string, sourceId: SourceId, sources: Source[]) {
  const hostname = new URL(url).hostname.toLowerCase();
  const source = sources.find((item) => item.id === sourceId);
  return Boolean(source?.officialHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)));
}
