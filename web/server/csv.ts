import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { productSchema, productsSchema, type Product, type PublicSnapshot, type SourceId } from '../src/lib/schema.ts';

const productCsvRowSchema = z.object({
  id: z.string().trim(),
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  capacity: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(120),
  comparison_unit: z.enum(['g', 'ml']),
  status: z.enum(['pending', 'active', 'paused']),
  coupang_url: z.string(),
  oliveyoung_url: z.string(),
});

type ProductCsvRow = z.infer<typeof productCsvRowSchema>;

function csv(records: Record<string, unknown>[], columns: string[]) {
  return stringify(records, { header: true, columns, bom: true, record_delimiter: 'windows' });
}

export function productsCsv(products: Product[]) {
  return csv(products.map((product) => ({
    id: product.id,
    brand: product.brand,
    name: product.name,
    capacity: product.capacity,
    variant: product.variant,
    comparison_unit: product.comparisonUnit,
    status: product.status,
    coupang_url: product.markets.coupang?.approvedUrl ?? '',
    oliveyoung_url: product.markets.oliveyoung?.approvedUrl ?? '',
  })), ['id', 'brand', 'name', 'capacity', 'variant', 'comparison_unit', 'status', 'coupang_url', 'oliveyoung_url']);
}

export function latestPricesCsv(snapshot: PublicSnapshot) {
  const records = snapshot.products.flatMap((product) => snapshot.sources.map((source) => {
    const observation = product.latestBySource[source.id];
    return {
      product_id: product.id,
      brand: product.brand,
      name: product.name,
      capacity: product.capacity,
      variant: product.variant,
      source: source.label,
      product_price: observation?.productPrice ?? '',
      shipping_fee: observation?.shippingFee ?? '',
      total_price: observation?.totalPrice ?? '',
      total_quantity: observation?.totalQuantity ?? product.markets[source.id as SourceId]?.totalQuantity ?? '',
      quantity_unit: observation?.quantityUnit ?? product.comparisonUnit,
      unit_price: observation?.unitPrice ?? '',
      comparable: observation?.comparable ?? false,
      stock_status: observation?.stockStatus ?? 'not_collected',
      freshness: observation ? (observation.isFresh ? 'fresh' : 'stale') : 'not_collected',
      is_lowest: product.winnerSourceIds.includes(source.id),
      captured_at: observation?.capturedAt ?? '',
      seller: observation?.seller ?? '',
      benefit_note: observation?.benefitNote ?? '',
      source_url: observation?.sourceUrl ?? product.markets[source.id as SourceId]?.approvedUrl ?? '',
    };
  }));
  return csv(records, ['product_id', 'brand', 'name', 'capacity', 'variant', 'source', 'product_price', 'shipping_fee', 'total_price', 'total_quantity', 'quantity_unit', 'unit_price', 'comparable', 'stock_status', 'freshness', 'is_lowest', 'captured_at', 'seller', 'benefit_note', 'source_url']);
}

export function importProductsCsv(content: string, currentProducts: Product[]) {
  const rows = z.array(productCsvRowSchema).parse(parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })) as ProductCsvRow[];
  const currentById = new Map(currentProducts.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const timestamp = new Date().toISOString();
  const imported = rows.map((row) => {
    if (!row.id) {
      return productSchema.parse({
        id: randomUUID(),
        brand: row.brand,
        name: row.name,
        capacity: row.capacity,
        variant: row.variant,
        comparisonUnit: row.comparison_unit,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
        markets: {},
        tracker: {
          searchQueries: [`${row.brand} ${row.name}`],
          requiredTerms: [row.brand, row.name],
          excludedTerms: [],
          packagePolicy: 'same_product_any_quantity',
          discoveryPolicy: 'every_run',
        },
      });
    }
    if (seen.has(row.id)) throw new Error(`CSV에 상품 ID가 중복되었습니다: ${row.id}`);
    seen.add(row.id);
    const current = currentById.get(row.id);
    if (!current) throw new Error(`알 수 없는 상품 ID입니다: ${row.id}. 새 상품은 id를 비워 주세요.`);
    if (row.status === 'active' && (!current.markets.coupang || !current.markets.oliveyoung)) {
      throw new Error(`두 판매처의 검증된 매핑이 없는 상품은 활성화할 수 없습니다: ${row.id}`);
    }
    return productSchema.parse({
      ...current,
      brand: row.brand,
      name: row.name,
      capacity: row.capacity,
      variant: row.variant,
      comparisonUnit: row.comparison_unit,
      status: row.status,
      updatedAt: timestamp,
    });
  });
  const omitted = currentProducts.filter((product) => !seen.has(product.id));
  return productsSchema.parse([...imported, ...omitted]);
}
