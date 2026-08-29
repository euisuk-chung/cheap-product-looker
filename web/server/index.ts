import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sourceIdSchema, productSchema } from '../src/lib/schema.ts';
import { loadStore, rebuildSnapshot, saveCandidates, saveProducts } from './store.ts';

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ mode: 'local-admin', writable: true });
});

app.get('/api/state', async (_request, response, next) => {
  try {
    const store = await loadStore();
    response.json({ ...store, snapshot: await rebuildSnapshot() });
  } catch (error) { next(error); }
});

const createProductSchema = z.object({
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  capacity: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(120).default(''),
});

app.post('/api/products', async (request, response, next) => {
  try {
    const input = createProductSchema.parse(request.body);
    const store = await loadStore();
    const timestamp = new Date().toISOString();
    const product = productSchema.parse({
      id: randomUUID(),
      ...input,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      markets: {},
    });
    await saveProducts([...store.products, product]);
    await rebuildSnapshot();
    response.status(201).json(product);
  } catch (error) { next(error); }
});

const decisionSchema = z.object({ decision: z.enum(['approved', 'rejected']) });

app.post('/api/candidates/:candidateId/decision', async (request, response, next) => {
  try {
    const { decision } = decisionSchema.parse(request.body);
    const store = await loadStore();
    const candidate = store.candidates.find((item) => item.id === request.params.candidateId);
    if (!candidate) return response.status(404).json({ message: '후보를 찾을 수 없습니다.' });
    const product = store.products.find((item) => item.id === candidate.productId);
    if (!product) return response.status(404).json({ message: '상품을 찾을 수 없습니다.' });

    const timestamp = new Date().toISOString();
    const candidates = store.candidates.map((item) => {
      if (item.id === candidate.id) return { ...item, status: decision };
      if (decision === 'approved' && item.productId === candidate.productId && item.sourceId === candidate.sourceId && item.status === 'pending') return { ...item, status: 'rejected' as const };
      return item;
    });

    const products = store.products.map((item) => {
      if (item.id !== product.id || decision !== 'approved') return item;
      const markets = {
        ...item.markets,
        [candidate.sourceId]: {
          sourceId: candidate.sourceId,
          approvedUrl: candidate.url,
          productTitle: candidate.title,
          seller: candidate.seller,
          packageDescription: candidate.packageDescription,
          approvedAt: timestamp,
        },
      };
      const ready = store.sources.every((source) => Boolean(markets[source.id]));
      return { ...item, markets, status: ready ? 'active' as const : 'pending' as const, updatedAt: timestamp };
    });

    await Promise.all([saveCandidates(candidates), saveProducts(products)]);
    await rebuildSnapshot();
    response.json({ candidateId: candidate.id, decision });
  } catch (error) { next(error); }
});

const researchSchema = z.object({ sourceId: sourceIdSchema.optional() });

app.post('/api/products/:productId/research', async (request, response, next) => {
  try {
    const { sourceId } = researchSchema.parse(request.body ?? {});
    const store = await loadStore();
    if (!store.products.some((item) => item.id === request.params.productId)) return response.status(404).json({ message: '상품을 찾을 수 없습니다.' });
    const timestamp = new Date().toISOString();
    const products = store.products.map((item) => {
      if (item.id !== request.params.productId) return item;
      const markets = { ...item.markets };
      if (sourceId) delete markets[sourceId];
      else for (const key of Object.keys(markets)) delete markets[key];
      return { ...item, markets, status: 'pending' as const, updatedAt: timestamp };
    });
    const candidates = store.candidates.map((item) => item.productId === request.params.productId && (!sourceId || item.sourceId === sourceId) ? { ...item, status: 'rejected' as const } : item);
    await Promise.all([saveProducts(products), saveCandidates(candidates)]);
    await rebuildSnapshot();
    response.json({ productId: request.params.productId, sourceId: sourceId ?? 'all', status: 'pending' });
  } catch (error) { next(error); }
});

const statusSchema = z.object({ status: z.enum(['active', 'paused']) });

app.patch('/api/products/:productId/status', async (request, response, next) => {
  try {
    const { status } = statusSchema.parse(request.body);
    const store = await loadStore();
    const product = store.products.find((item) => item.id === request.params.productId);
    if (!product) return response.status(404).json({ message: '상품을 찾을 수 없습니다.' });
    if (status === 'active' && !store.sources.every((source) => Boolean(product.markets[source.id]))) return response.status(409).json({ message: '두 판매처 후보를 모두 승인해야 활성화할 수 있습니다.' });
    const products = store.products.map((item) => item.id === product.id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
    await saveProducts(products);
    await rebuildSnapshot();
    response.json({ productId: product.id, status });
  } catch (error) { next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next;
  if (error instanceof z.ZodError) return response.status(400).json({ message: '입력값을 확인해 주세요.', issues: error.issues });
  console.error(error);
  response.status(500).json({ message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' });
});

app.listen(4174, '127.0.0.1', () => {
  console.log('Local admin API listening on http://127.0.0.1:4174');
});
