import { z } from 'zod';
import { loadStore, rebuildSnapshot, saveRuns } from './store.ts';

const runId = z.string().uuid().parse(process.argv[2]);
const publishStatus = z.enum(['succeeded', 'failed']).parse(process.argv[3]);
const store = await loadStore();
if (!store.runs.some((run) => run.id === runId)) throw new Error(`Unknown run: ${runId}`);

await saveRuns(store.runs.map((run) => run.id === runId ? { ...run, publishStatus } : run));
await rebuildSnapshot();
console.log(`Updated ${runId} publish status to ${publishStatus}.`);
