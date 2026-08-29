import { rebuildSnapshot } from './store.ts';

const snapshot = await rebuildSnapshot();
console.log(`Snapshot rebuilt at ${snapshot.generatedAt}.`);
