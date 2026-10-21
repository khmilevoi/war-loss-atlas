import { action, atom, batch, computed, withComputed, withSearchParams } from '@reatom/core';
import type { AtlasData, Filters, Layer } from '../data/types';
import { defaultPeriod, HISTORY_PERIOD_NOTE, normalizeFilters, normalizeSort,
  selectConflicts, selectHistoricalHighlights, selectRows, UCDP_PERIOD_NOTE, type Completeness } from '../data/selectors';

export interface AtlasModelOptions { defaultLayer?: Layer; defaultSelectedId?: string }
const parseYear = (value: string | undefined, fallback: number): number => value === undefined ? fallback
  : /^\d{4}$/.test(value) ? Number(value) : Number.NaN;

/** Create inside the caller's frame. SSR callers own context.start and must neutralize urlAtom.sync before setting URL. */
export function createAtlasModel(data: AtlasData, options: AtlasModelOptions = {}) {
  const defaultLayer = options.defaultLayer ?? 'ucdp';
  // Filters/selection replace the current page's shareable view state.
  // Route navigation still pushes; Back returns to the previous page, not each edit.
  const layer = atom<Layer>(defaultLayer, 'atlas.layer').extend(withSearchParams('layer', {
    replace: true,
    parse: value => value === 'history' || value === 'ucdp' ? value : defaultLayer,
  }));
  const from = atom(() => defaultPeriod(layer())[0], 'atlas.from').extend(withSearchParams('from', {
    replace: true,
    parse: value => parseYear(value, defaultPeriod(layer())[0]),
  }));
  const to = atom(() => defaultPeriod(layer())[1], 'atlas.to').extend(withSearchParams('to', {
    replace: true,
    parse: value => parseYear(value, defaultPeriod(layer())[1]),
  }));
  const query = atom('', 'atlas.query').extend(withSearchParams('q', { replace: true }));
  const sort = atom('year:asc', 'atlas.sort').extend(withSearchParams('sort', {
    replace: true,
    parse: value => normalizeSort(value ?? 'year:asc', layer()),
  }), withComputed(value => normalizeSort(value, layer())));
  const completeness = atom<Completeness>('all', 'atlas.completeness').extend(withSearchParams('completeness', {
    replace: true,
    parse: value => value === 'complete' || value === 'partial' || value === 'missing' ? value : 'all',
  }), withComputed(value => layer() === 'history' ? 'all' : value));

  const validSelection = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return (layer() === 'ucdp' ? data.conflicts.some(summary => summary.id === id)
      : data.historicalHighlights.some(highlight => highlight.highlight_id === id)) ? id : null;
  };
  const selectedId = atom<string | null>(() => validSelection(options.defaultSelectedId), 'atlas.selectedId').extend(
    withSearchParams('selected', { replace: true, parse: value => validSelection(value), serialize: value => value ?? undefined }),
    withComputed(value => validSelection(value)),
  );
  const filters = computed(() => normalizeFilters({ layer: layer(), from: from(), to: to(), query: query(),
    sort: sort(), completeness: completeness() }), 'atlas.filters');
  const filteredRows = computed(() => selectRows(data, filters()), 'atlas.filteredRows');
  const summaries = computed(() => selectConflicts(data, filters()), 'atlas.summaries');
  const historicalHighlights = computed(() => selectHistoricalHighlights(data, filters()), 'atlas.historicalHighlights');
  const periodNote = computed(() => layer() === 'ucdp' ? UCDP_PERIOD_NOTE : HISTORY_PERIOD_NOTE, 'atlas.periodNote');

  const selectConflict = action((id: string | null) => {
    const next = validSelection(id);
    selectedId.set(next === selectedId() ? null : next);
  }, 'atlas.selectConflict');
  const applyDefaults = action((next: Layer) => {
    const [min, max] = defaultPeriod(next);
    // In core1001.3 each search-param hook compares the URL seen by its write.
    // Flush each native extension before the next write changes that URL.
    // Reset dependent values before layer changes can derive them automatically.
    batch(() => selectedId.set(null), true);
    batch(() => query.set(''), true);
    batch(() => sort.set('year:asc'), true);
    batch(() => completeness.set('all'), true);
    batch(() => from.set(min), true);
    batch(() => to.set(max), true);
    batch(() => layer.set(next), true);
  }, 'atlas.applyDefaults');
  const resetFilters = action(() => {
    applyDefaults(layer());
  }, 'atlas.resetFilters');
  const switchLayer = action((next: Layer) => {
    applyDefaults(next === 'history' ? 'history' : 'ucdp');
  }, 'atlas.switchLayer');
  return { layer, from, to, query, sort, completeness, selectedId, filters, filteredRows, summaries, historicalHighlights,
    periodNote, selectConflict, resetFilters, switchLayer };
}

export type AtlasModel = ReturnType<typeof createAtlasModel>;
