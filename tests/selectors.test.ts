import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { context, urlAtom, wrap } from '@reatom/core';
import { loadAtlasData, aggregateConflicts } from '../src/data';
import { NATIVE_FIELDS, type AtlasData, type Filters, type NativeRow } from '../src/data/types';
import { selectConflicts, selectRows, selectHistoricalHighlights } from '../src/data/selectors';
import { toCsv, toHistoricalCsv } from '../src/data/csv';
import { createAtlasModel } from '../src/model/atlas';

const defaults: Filters = { layer: 'ucdp', from: 1989, to: 2025, query: '', sort: 'year:asc', completeness: 'all' };
const source = loadAtlasData();
function fixture(rows: NativeRow[]): AtlasData {
  return { ...source, nativeRows: rows, conflicts: [...aggregateConflicts(rows)] };
}
function row(id: string, year: number, extra: Partial<NativeRow> = {}): NativeRow {
  return { ...source.nativeRows[0], conflict_id: id, year, location_inc: 'Мир', territory_name: 'территория',
    bd_best: 10, bd_low: 5, bd_high: 20, ...extra };
}
function inUrl<T>(search: string, run: () => T): T {
  return context.start(() => {
    urlAtom.sync.set(() => () => {});
    urlAtom.set(new URL(`https://atlas.example/data${search}`));
    return run();
  });
}

describe('whole-source conflict selection', () => {
  const data = fixture([row('a', 1989), row('a', 2025, { bd_best: 30 }), row('b', 1990), row('c', 2025)]);

  it('includes both first-observed boundaries and every later source row, without year truncation', () => {
    const filters = { ...defaults, from: 1989, to: 1989 };
    expect(selectRows(data, filters).map(r => `${r.conflict_id}:${r.year}`)).toEqual(['a:1989', 'a:2025']);
    expect(selectConflicts(data, filters)).toMatchObject([{ id: 'a', firstObservedYear: 1989,
      lastObservedYear: 2025, best: 40, rowIds: ['a:1989', 'a:2025'] }]);
    expect(selectConflicts(data, { ...defaults, from: 1990, to: 2025 }).map(c => c.id)).toEqual(['b', 'c']);
    expect(selectConflicts(data, { ...defaults, from: 2025, to: 2025 }).map(c => c.id)).toEqual(['c']);
  });

  it('searches Unicode/case-normalized native values and retains whole-conflict rows', () => {
    const unicode = fixture([row('a', 1989), row('a', 2025, { side_b: 'CAFÉ — СЕВЕР, союз' }), row('b', 1990)]);
    expect(selectRows(unicode, { ...defaults, query: '  cafe\u0301 — север  ' }).map(r => r.year)).toEqual([1989, 2025]);
    expect(selectConflicts(unicode, { ...defaults, query: 'союз' })[0].best).toBe(20);
    expect(selectRows(unicode, { ...defaults, query: 'несуществующее' })).toEqual([]);
    expect(selectConflicts(unicode, { ...defaults, query: 'несуществующее' })).toEqual([]);
  });

  it('breaks equal sort values by stable conflict_id:year independently of input order', () => {
    const tied = fixture([row('b', 2025), row('a', 2025), row('a', 1989)]);
    expect(selectRows(tied, { ...defaults, sort: 'bd_best:desc' }).map(r => `${r.conflict_id}:${r.year}`))
      .toEqual(['a:1989', 'a:2025', 'b:2025']);
    expect(selectConflicts(fixture([row('b', 1989), row('a', 1989)]), defaults).map(c => c.id)).toEqual(['a', 'b']);
  });

  it('sorts missing values last in both directions and keeps missing different from zero', () => {
    const missing = fixture([row('missing', 1989, { bd_best: null, bd_low: null, bd_high: null }),
      row('zero', 1989, { bd_best: 0 }), row('known', 1989)]);
    expect(selectRows(missing, { ...defaults, sort: 'bd_best:asc' }).map(r => r.conflict_id)).toEqual(['zero', 'known', 'missing']);
    expect(selectRows(missing, { ...defaults, sort: 'bd_best:desc' }).map(r => r.conflict_id)).toEqual(['known', 'zero', 'missing']);
    expect(selectConflicts(missing, defaults).find(c => c.id === 'missing')?.best).toBeNull();
    expect(selectConflicts(missing, defaults).find(c => c.id === 'zero')?.best).toBe(0);
  });

  it('filters source-wide completeness without dropping individual years or inventing confidence', () => {
    const missing = fixture([row('complete', 1989), row('partial', 1989), row('partial', 2025, { bd_low: null }),
      row('missing', 1989, { bd_best: null, bd_low: null, bd_high: null })]);
    expect(selectRows(missing, { ...defaults, completeness: 'complete' }).map(r => r.conflict_id)).toEqual(['complete']);
    expect(selectRows(missing, { ...defaults, completeness: 'partial' }).map(r => r.year)).toEqual([1989, 2025]);
    expect(selectConflicts(missing, { ...defaults, completeness: 'partial' })[0]).toMatchObject({
      best: 20, low: 5, high: 40, missingCounts: { best: 0, low: 1, high: 0 } });
    expect(selectRows(missing, { ...defaults, completeness: 'missing' }).map(r => r.conflict_id)).toEqual(['missing']);
  });

  it('retains the actual complete source checksums without historical metrics or placement multiplication', () => {
    const expanded = { ...source, placements: [...source.placements, ...source.placements] };
    const rows = selectRows(expanded, defaults);
    expect(rows).toHaveLength(1650);
    expect(selectConflicts(expanded, defaults)).toHaveLength(202);
    expect(rows.reduce((n, r) => n + (r.bd_best ?? 0), 0)).toBe(2566047);
    expect(selectConflicts(expanded, defaults).reduce((n, c) => n + (c.best ?? 0), 0)).toBe(2566047);
    expect(selectRows(expanded, { ...defaults, layer: 'history', from: 1861 })).toEqual([]);
    expect(selectConflicts(expanded, { ...defaults, layer: 'history', from: 1861 })).toEqual([]);
  });

  it('selects historical start years inclusively and preserves exact source-specific metrics without ranking losses', () => {
    const history = selectHistoricalHighlights(source, { ...defaults, layer: 'history', from: 1914, to: 1939, sort: 'bd_best:desc' });
    expect(history.map(h => h.highlight_id)).toEqual(['ww1', 'ww2']);
    expect(history[0]).toMatchObject({ metric: 'total_war_deaths', value: 16000000, low: null, high: null,
      estimate_kind: 'approximate', source_url: 'https://www.archives.gov/press/press-releases/2009/nr09-77' });
    expect(history[1]).toMatchObject({ value: null, low: 65000000, high: null, lower_exclusive: true });
    expect(selectHistoricalHighlights(source, { ...defaults, layer: 'history', from: 1861, to: 2025, query: 'КОРЕЙСКАЯ' }))
      .toMatchObject([{ highlight_id: 'korea', metric: 'civilian_war_deaths', value: 2000000 }]);
    expect(selectHistoricalHighlights(source, defaults)).toEqual([]);
  });
});

describe('complete permitted CSV exports', () => {
  it('exports all filtered native records regardless of a hypothetical visible window', () => {
    const rows = selectRows(source, defaults);
    const visibleWindow = rows.slice(0, 12);
    const records = parse<Record<string, string>>(toCsv(rows), { columns: true });
    expect(records).toHaveLength(1650);
    expect(records).not.toHaveLength(visibleWindow.length);
    expect(Object.keys(records[0])).toEqual([...NATIVE_FIELDS]);
    expect(records.some(r => r.conflict_id === rows[1649].conflict_id && r.year === String(rows[1649].year))).toBe(true);
  });

  it('roundtrips comma, quote, Unicode, CRLF and newline values; null remains empty and zero remains zero', () => {
    const original = row('quoted', 2025, { side_a: '"Союз", café\r\nновая строка', dyad_id: '12, 34', bd_best: null, bd_low: 0 });
    const [record] = parse<Record<string, string>>(toCsv([original]), { columns: true });
    expect(record.side_a).toBe('"Союз", café\r\nновая строка');
    expect(record.dyad_id).toBe('12, 34');
    expect(record.bd_best).toBe('');
    expect(record.bd_low).toBe('0');
    expect(parse(toCsv([]), { columns: true })).toEqual([]);
  });

  it('exports the independent historical schema with all provenance and estimate semantics', () => {
    const records = parse<Record<string, string>>(toHistoricalCsv(source.historicalHighlights), { columns: true });
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({ highlight_id: 'ww1', value: '16000000', low: '', high: '',
      metric: 'total_war_deaths', estimate_kind: 'approximate', lower_exclusive: 'false',
      source_url: 'https://www.archives.gov/press/press-releases/2009/nr09-77' });
    expect(records[1]).toMatchObject({ highlight_id: 'ww2', value: '', low: '65000000', lower_exclusive: 'true' });
    expect(JSON.parse(records[0].placement_ids)).toEqual(source.historicalHighlights[0].placement_ids);
    expect(Object.keys(records[0])).toEqual(Object.keys(source.historicalHighlights[0]));
  });
});

describe('request-local URL-backed model', () => {
  it('defaults to all native data and resets a filtered empty selection', () => inUrl('', () => {
    const model = createAtlasModel(source);
    expect(model.filteredRows()).toHaveLength(1650);
    model.query.set('absent-catalogue-record');
    expect(model.filteredRows()).toEqual([]);
    model.selectConflict(source.conflicts[0].id);
    model.resetFilters();
    expect(model.filters()).toEqual(defaults);
    expect(model.selectedId()).toBeNull();
    expect(model.filteredRows()).toHaveLength(1650);
    expect(model.periodNote()).toContain('Первый год наблюдения');
    expect(model.periodNote()).toContain('весь доступный период');
  }));

  it('reads valid Unicode URL values and wrapped direct atom writes update Reatom URL state', async () => {
    // Reatom batches URL change hooks in a microtask, as it does for UI handlers.
    const handlers = inUrl('?from=1989&to=1989&q=CAF%C3%89&sort=bd_best%3Adesc&completeness=partial', () => {
      const model = createAtlasModel(source);
      const unsubscribe = model.filters.subscribe();
      return {
        filters: wrap(() => model.filters()),
        query: wrap(() => model.query.set('Север, "союз"')),
        sort: wrap(() => model.sort.set('year:desc')),
        param: wrap((key: string) => urlAtom().searchParams.get(key)),
        unsubscribe,
      };
    });
    try {
    expect(handlers.filters()).toEqual({ ...defaults, to: 1989, query: 'CAFÉ', sort: 'bd_best:desc', completeness: 'partial' });
    handlers.query();
    await Promise.resolve();
    expect(handlers.param('q')).toBe('Север, "союз"');
    handlers.sort();
    await Promise.resolve();
    expect(handlers.param('sort')).toBe('year:desc');
    } finally { handlers.unsubscribe(); }
  });

  it.each(['?from=abc&to=2025', '?from=2000&to=1999', '?from=1988&to=2025',
    '?from=1989&to=2026', '?from=1989.5&to=2025', '?from=&to=2025', '?from=1e3&to=2025'])
    ('normalizes the invalid full period to UCDP defaults: %s', search => inUrl(search, () => {
      const model = createAtlasModel(source);
      expect(model.filters()).toMatchObject({ from: 1989, to: 2025 });
      expect(model.filteredRows()).toHaveLength(1650);
    }));

  it('normalizes invalid enums and selection without accepting a cross-layer id', () => inUrl('?layer=wrong&sort=wrong&completeness=wrong&selected=ww2', () => {
    const model = createAtlasModel(source);
    expect(model.filters()).toEqual(defaults);
    expect(model.selectedId()).toBeNull();
  }));

  it('supports route defaults while an explicit valid URL layer wins', () => {
    inUrl('', () => {
      const model = createAtlasModel(source, { defaultLayer: 'history', defaultSelectedId: 'ww2' });
      expect(model.filters()).toEqual({ ...defaults, layer: 'history', from: 1861 });
      expect(model.selectedId()).toBe('ww2');
      expect(model.historicalHighlights()).toHaveLength(4);
      expect(model.filteredRows()).toEqual([]);
      expect(model.summaries()).toEqual([]);
    });
    inUrl('?layer=ucdp', () => {
      const model = createAtlasModel(source, { defaultLayer: 'history', defaultSelectedId: 'ww2' });
      expect(model.filteredRows()).toHaveLength(1650);
      expect(model.selectedId()).toBeNull();
    });
  });

  it('clears incompatible filters and selection on a named layer transition', () => inUrl('', () => {
    const model = createAtlasModel(source);
    model.query.set('query');
    model.completeness.set('missing');
    model.sort.set('bd_best:desc');
    model.selectConflict(source.conflicts[0].id);
    model.switchLayer('history');
    expect(model.filters()).toEqual({ ...defaults, layer: 'history', from: 1861 });
    expect(model.selectedId()).toBeNull();
    expect(model.historicalHighlights()).toHaveLength(4);
    model.selectConflict('ww2');
    expect(model.selectedId()).toBe('ww2');
    model.selectConflict('ww2');
    expect(model.selectedId()).toBeNull();
    model.selectConflict('does-not-exist');
    expect(model.selectedId()).toBeNull();
    model.switchLayer('ucdp');
    expect(model.filters()).toEqual(defaults);
    expect(model.filteredRows()).toHaveLength(1650);
  }));

  it('uses the historical period on an invalid historical URL and keeps claim objects intact', () => inUrl('?layer=history&from=2025&to=1861&completeness=missing&sort=bd_best:desc&selected=ww2', () => {
    const model = createAtlasModel(source);
    expect(model.filters()).toEqual({ ...defaults, layer: 'history', from: 1861 });
    expect(model.selectedId()).toBe('ww2');
    expect(model.historicalHighlights()).toHaveLength(4);
    expect(model.summaries()).toEqual([]);
  }));

  it('persists a connected layer transition and reset as a reloadable URL without old selection or filters', async () => {
    const handlers = inUrl(`?layer=ucdp&from=2000&to=2025&q=old&sort=bd_best:desc&completeness=missing&selected=${source.conflicts[0].id}`, () => {
      const model = createAtlasModel(source);
      const stopFilters = model.filters.subscribe();
      const stopSelected = model.selectedId.subscribe();
      return {
        switchLayer: wrap(() => model.switchLayer('history')),
        filter: wrap(() => model.query.set('Корейская')),
        select: wrap(() => model.selectConflict('ww2')),
        reset: wrap(() => model.resetFilters()),
        search: wrap(() => urlAtom().search),
        read: wrap(() => ({ filters: model.filters(), selectedId: model.selectedId() })),
        stop: () => { stopFilters(); stopSelected(); },
      };
    });
    try {
      await Promise.resolve();
      handlers.switchLayer();
      await Promise.resolve();
      expect(handlers.read()).toEqual({ filters: { ...defaults, layer: 'history', from: 1861 }, selectedId: null });
      const afterSwitch = new URLSearchParams(handlers.search());
      expect(afterSwitch.get('layer')).toBe('history');
      expect(afterSwitch.get('from')).toBe('1861');
      expect(afterSwitch.has('selected')).toBe(false);
      expect(afterSwitch.get('completeness')).toBe('all');
      handlers.filter();
      handlers.select();
      await Promise.resolve();
      expect(new URLSearchParams(handlers.search()).get('selected')).toBe('ww2');
      handlers.reset();
      await Promise.resolve();
      inUrl(handlers.search(), () => {
        const reloaded = createAtlasModel(source);
        expect(reloaded.filters()).toEqual({ ...defaults, layer: 'history', from: 1861 });
        expect(reloaded.historicalHighlights()).toHaveLength(4);
        expect(reloaded.selectedId()).toBeNull();
      });
    } finally { handlers.stop(); }
  });

  it('reacts to back/forward URL replacement without a React synchronization effect', () => inUrl('', () => {
    const model = createAtlasModel(source);
    expect(model.filteredRows()).toHaveLength(1650);
    urlAtom.set(new URL('https://atlas.example/data?layer=history&from=1939&to=1939&selected=ww2'));
    expect(model.historicalHighlights().map(h => h.highlight_id)).toEqual(['ww2']);
    expect(model.selectedId()).toBe('ww2');
    expect(model.filteredRows()).toEqual([]);
    urlAtom.set(new URL('https://atlas.example/data'));
    expect(model.filteredRows()).toHaveLength(1650);
  }));

  it.each(['switchLayer', 'resetFilters'] as const)('%s replaces in-page state without intermediate Back destinations, while route navigation pushes', async transition => {
    const previousPage = 'https://atlas.example/?layer=history&from=1861&to=2025&selected=ww2';
    const initialPage = `https://atlas.example/data?layer=ucdp&from=2000&to=2025&q=old&sort=bd_best:desc&completeness=missing&selected=${source.conflicts[0].id}`;
    // This adapter records the production sync boundary and applies actual push/replace semantics.
    const entries = [previousPage, initialPage];
    let index = 1;
    const operations: { href: string; replace: boolean }[] = [];
    const handlers = context.start(() => {
      urlAtom.sync.set(() => () => {});
      urlAtom.set(new URL(initialPage));
      const model = createAtlasModel(source);
      const stopFilters = model.filters.subscribe();
      const stopSelected = model.selectedId.subscribe();
      urlAtom.sync.set(() => (url: URL, replace = false) => {
        operations.push({ href: url.href, replace });
        if (replace) entries[index] = url.href;
        else {
          entries.splice(index + 1);
          entries.push(url.href);
          index++;
        }
      });
      return {
        transition: wrap(() => transition === 'switchLayer' ? model.switchLayer('history') : model.resetFilters()),
        read: wrap(() => ({ filters: model.filters(), selectedId: model.selectedId(), href: urlAtom().href })),
        back: wrap(() => urlAtom.syncFromSource(new URL(entries[--index]), true)),
        navigate: wrap(() => urlAtom.go('/data?layer=ucdp&from=1989&to=1989')),
        stop: () => { stopFilters(); stopSelected(); },
      };
    });
    try {
      await Promise.resolve();
      operations.length = 0;
      handlers.transition();
      await Promise.resolve();
      expect(operations.length).toBeGreaterThan(0);
      expect(operations.every(operation => operation.replace)).toBe(true);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toBe(previousPage);
      const final = handlers.read();
      expect(final.filters).toEqual({ ...defaults, layer: transition === 'switchLayer' ? 'history' : 'ucdp',
        from: transition === 'switchLayer' ? 1861 : 1989 });
      expect(final.selectedId).toBeNull();
      expect(entries[1]).toBe(final.href);
      inUrl(new URL(final.href).search, () => {
        expect(createAtlasModel(source).filters()).toEqual(final.filters);
      });
      handlers.back();
      await Promise.resolve();
      expect(handlers.read()).toEqual({ href: previousPage,
        filters: { ...defaults, layer: 'history', from: 1861 }, selectedId: 'ww2' });
      const beforeRouteNavigation = operations.length;
      handlers.navigate();
      await Promise.resolve();
      expect(operations.slice(beforeRouteNavigation)).toEqual([{ href: 'https://atlas.example/data?layer=ucdp&from=1989&to=1989', replace: false }]);
      expect(index).toBe(1);
      handlers.back();
      await Promise.resolve();
      expect(handlers.read().href).toBe(previousPage);
    } finally { handlers.stop(); }
  });
});
