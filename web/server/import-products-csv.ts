import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importProductsCsv } from './csv.ts';
import { dataDirectory, loadStore, rebuildSnapshot, saveProducts } from './store.ts';

const inputPath = path.resolve(process.argv[2] ?? path.join(dataDirectory, 'products.csv'));
const store = await loadStore();
const products = importProductsCsv(await readFile(inputPath, 'utf8'), store.products);
await saveProducts(products);
await rebuildSnapshot();
console.log(`Imported ${products.length} products from ${inputPath}.`);
