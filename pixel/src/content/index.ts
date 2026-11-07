import briefs from 'virtual:pixel-atlas-briefs';
import { contentId } from './parse';
import type { BriefLocale, CardContent, CardRef } from './parse';

export { contentId, parseBriefCollection, validateContentCoverage } from './parse';
export type { BriefLocale, CardContent, CardRef } from './parse';

const collections = {
  ru: new Map(briefs.ru),
  en: new Map(briefs.en),
} as const;

export function readCardContent(ref: CardRef, locale: BriefLocale): CardContent | null {
  return collections[locale].get(contentId(ref)) ?? null;
}

export function readBriefCollections(): Readonly<Record<BriefLocale, ReadonlyMap<string, CardContent>>> {
  return collections;
}
