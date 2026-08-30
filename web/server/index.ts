import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { productSchema, quantityUnitSchema } from '../src/lib/schema.ts';
import { loadStore, rebuildSnapshot, saveProducts } from './store.ts';
import { importProductsCsv } from './csv.ts';

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

app.post('/api/products/import-csv', express.text({ type: 'text/csv', limit: '512kb' }), async (request, response, next) => {
  try {
    const store = await loadStore();
    const products = importProductsCsv(request.body, store.products);
    await saveProducts(products);
    const snapshot = await rebuildSnapshot();
    response.json({ importedCount: products.length, snapshot });
  } catch (error) { next(error); }
});

const createProductSchema = z.object({
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  capacity: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(120).default(''),
  comparisonUnit: quantityUnitSchema,
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
      tracker: {
        searchQueries: [`${input.brand} ${input.name}`],
        requiredTerms: [input.brand, input.name],
        excludedTerms: [],
        packagePolicy: 'same_product_any_quantity',
        discoveryPolicy: 'every_run',
      },
    });
    await saveProducts([...store.products, product]);
    await rebuildSnapshot();
    response.status(201).json(product);
  } catch (error) { next(error); }
});

const statusSchema = z.object({ status: z.enum(['active', 'paused']) });

app.patch('/api/products/:productId/status', async (request, response, next) => {
  try {
    const { status } = statusSchema.parse(request.body);
    const store = await loadStore();
    const product = store.products.find((item) => item.id === request.params.productId);
    if (!product) return response.status(404).json({ message: '상품을 찾을 수 없습니다.' });
    if (status === 'active' && !store.sources.every((source) => Boolean(product.markets[source.id]))) return response.status(409).json({ message: '두 판매처의 검증된 매핑이 있어야 활성화할 수 있습니다.' });
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
