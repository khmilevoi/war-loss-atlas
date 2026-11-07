declare module 'virtual:pixel-atlas-briefs' {
  import type { BriefLocale, CardContent } from './parse';

  const briefs: Readonly<Record<BriefLocale, readonly (readonly [string, CardContent])[]>>;
  export default briefs;
}
