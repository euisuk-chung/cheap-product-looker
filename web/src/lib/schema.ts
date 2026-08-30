import { z } from 'zod';

export const sourceIdSchema = z.enum(['coupang', 'oliveyoung']);
export const isoDateSchema = z.string().datetime({ offset: true });
export const stockStatusSchema = z.enum(['in_stock', 'out_of_stock', 'unknown']);
export const quantityUnitSchema = z.enum(['g', 'ml']);

export const sourceSchema = z.object({
  id: sourceIdSchema,
  label: z.string().min(1),
  officialHosts: z.array(z.string().min(1)).min(1),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export const marketMappingSchema = z.object({
  sourceId: sourceIdSchema,
  approvedUrl: z.string().url(),
  productTitle: z.string().min(1),
  seller: z.string().min(1).nullable(),
  packageDescription: z.string().min(1),
  totalQuantity: z.number().positive(),
  quantityUnit: quantityUnitSchema,
  approvedAt: isoDateSchema,
});

export const trackerHarnessSchema = z.object({
  searchQueries: z.array(z.string().min(2)).min(1).max(6),
  requiredTerms: z.array(z.string().min(1)).min(1),
  excludedTerms: z.array(z.string().min(1)).default([]),
  packagePolicy: z.literal('same_product_any_quantity'),
  discoveryPolicy: z.literal('every_run'),
});

export const productSchema = z.object({
  id: z.string().uuid(),
  brand: z.string().min(1),
  name: z.string().min(1),
  capacity: z.string().min(1),
  variant: z.string(),
  comparisonUnit: quantityUnitSchema,
  status: z.enum(['pending', 'active', 'paused']),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  markets: z.record(z.string(), marketMappingSchema),
  tracker: trackerHarnessSchema,
});

export const candidateSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sourceId: sourceIdSchema,
  title: z.string().min(1),
  url: z.string().url(),
  seller: z.string().min(1).nullable(),
  packageDescription: z.string().min(1),
  totalQuantity: z.number().positive(),
  quantityUnit: quantityUnitSchema,
  matchReason: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  evidenceLevel: z.enum(['live_page', 'official_index']),
  observedPrice: z.number().int().nonnegative().nullable(),
  shippingFee: z.number().int().nonnegative().nullable(),
  stockStatus: stockStatusSchema,
  discoveredAt: isoDateSchema,
  candidateKind: z.enum(['initial', 'replacement', 'promotion']),
  replacesUrl: z.string().url().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
});

export const observationSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  productId: z.string().uuid(),
  sourceId: sourceIdSchema,
  productPrice: z.number().int().nonnegative(),
  shippingFee: z.number().int().nonnegative().nullable(),
  totalPrice: z.number().int().nonnegative().nullable(),
  totalQuantity: z.number().positive(),
  quantityUnit: quantityUnitSchema,
  unitPrice: z.number().nonnegative().nullable(),
  comparable: z.boolean(),
  stockStatus: stockStatusSchema,
  seller: z.string().min(1).nullable(),
  benefitNote: z.string().min(1).nullable(),
  capturedAt: isoDateSchema,
  sourceUrl: z.string().url(),
}).superRefine((value, context) => {
  if (value.shippingFee === null && (value.totalPrice !== null || value.comparable)) {
    context.addIssue({ code: 'custom', message: '배송비가 불명확하면 총액은 null이고 비교 불가여야 합니다.' });
  }
  if (value.totalPrice === null && value.unitPrice !== null) {
    context.addIssue({ code: 'custom', message: '총액이 없으면 단위 가격도 null이어야 합니다.' });
  }
  if (value.totalPrice !== null && (value.unitPrice === null || Math.abs(value.unitPrice - value.totalPrice / value.totalQuantity) > 0.01)) {
    context.addIssue({ code: 'custom', message: '단위 가격은 총액을 판매 구성의 총용량으로 나눈 값이어야 합니다.' });
  }
  if (value.comparable && value.unitPrice === null) {
    context.addIssue({ code: 'custom', message: '비교 가능한 관측에는 단위 가격이 필요합니다.' });
  }
  if (value.shippingFee !== null && value.totalPrice !== value.productPrice + value.shippingFee) {
    context.addIssue({ code: 'custom', message: '총액은 상품가와 배송비의 합이어야 합니다.' });
  }
  if (value.stockStatus !== 'in_stock' && value.comparable) {
    context.addIssue({ code: 'custom', message: '재고가 없는 상품은 비교할 수 없습니다.' });
  }
});

export const sourceResultSchema = z.object({
  sourceId: sourceIdSchema,
  status: z.enum(['succeeded', 'failed', 'blocked']),
  observedCount: z.number().int().nonnegative(),
  error: z.string().min(1).nullable(),
});

export const runSchema = z.object({
  id: z.string().uuid(),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema,
  sourceResults: z.array(sourceResultSchema).length(2),
  validationErrors: z.array(z.string()),
  publishStatus: z.enum(['not_requested', 'pending', 'succeeded', 'failed']),
});

export const collectorPayloadSchema = z.object({
  run: runSchema,
  candidates: z.array(candidateSchema).default([]),
  observations: z.array(observationSchema).default([]),
});

export const productsSchema = z.array(productSchema);
export const candidatesSchema = z.array(candidateSchema);
export const observationsSchema = z.array(observationSchema);
export const runsSchema = z.array(runSchema);
export const sourcesSchema = z.array(sourceSchema).length(2);

export type SourceId = z.infer<typeof sourceIdSchema>;
export type QuantityUnit = z.infer<typeof quantityUnitSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Product = z.infer<typeof productSchema>;
export type MarketCandidate = z.infer<typeof candidateSchema>;
export type PriceObservation = z.infer<typeof observationSchema>;
export type CollectionRun = z.infer<typeof runSchema>;
export type CollectorPayload = z.infer<typeof collectorPayloadSchema>;

export type ProductSnapshot = Product & {
  latestBySource: Partial<Record<SourceId, PriceObservation & { isFresh: boolean }>>;
  winnerSourceIds: SourceId[];
  history: PriceObservation[];
};

export type PublicSnapshot = {
  generatedAt: string;
  activeProductCount: number;
  pendingProductCount: number;
  latestSuccessfulRunAt: string | null;
  sources: Source[];
  products: ProductSnapshot[];
  runs: CollectionRun[];
};
