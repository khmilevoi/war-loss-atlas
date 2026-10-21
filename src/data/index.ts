import atlas from './generated/atlas.json';
import type { AtlasData } from './types';
export { aggregateConflicts } from './aggregate';
export { validatePublicData } from './validate';
export * from './types';

/** Static permitted data only. Callers must derive UI state without mutating this shared source. */
export function loadAtlasData(): AtlasData { return atlas as unknown as AtlasData; }
