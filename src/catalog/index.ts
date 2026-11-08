import { loadAtlasData } from '../data';
import type {
  AtlasData,
  ConflictSummary,
  HistoricalHighlight,
  Placement,
  SourceRecord,
} from '../data';

export type WarId = `ucdp:${string}` | `history:${string}`;
export type Names = Readonly<Record<'ru' | 'en', string>>;
export type SourceKind = 'ucdp' | 'history';
export type Period = Readonly<{ from: number; to: number }>;

export interface EpisodeRef {
  readonly warId: WarId;
  readonly episodeId: string;
}

export interface Anchor {
  readonly latitude: number;
  readonly longitude: number;
  readonly precision: 'illustrative_region' | 'illustrative_landmark';
  readonly label: string;
  readonly basis: string;
  readonly sourceUrl: string;
  readonly coordinateSourceUrl?: string;
}

export interface EstimateSource {
  readonly title: string;
  readonly url: string;
  readonly locator?: string;
  readonly version?: string;
  readonly accessedOn?: string;
}

export interface Estimate {
  readonly metric: string;
  readonly qualifier: 'reported' | 'approximate' | 'more-than' | 'at-least' | 'unknown';
  readonly value: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly comparisonKey: string | null;
  readonly source: EstimateSource;
  readonly scope: string;
  readonly uncertainty: string;
  readonly displayRu?: string;
  readonly missingCounts?: Readonly<ConflictSummary['missingCounts']>;
}

export interface War {
  readonly id: WarId;
  readonly name: string;
  readonly names: Names;
  readonly period: Period;
  readonly estimate: Estimate;
  readonly anchor: Anchor | null;
  readonly sourceKind: SourceKind;
  readonly rowIds: readonly string[];
}

export interface Episode extends EpisodeRef {
  readonly names: Names;
  readonly period: Period;
  readonly estimate: Estimate;
  readonly anchor: Anchor | null;
  readonly date?: Readonly<{ iso: string; precision: 'day'; sourceUrl: string }>;
  readonly estimatePeriod?: Readonly<{ from: string; through: string }>;
}

export interface MapPlacement {
  readonly flagId: string;
  readonly warId: WarId;
  readonly episodeId: string | null;
  readonly anchor: Anchor;
  readonly estimate: Estimate;
  readonly names: Names;
  readonly sourceKind: SourceKind;
}

export interface Catalog {
  readonly wars: readonly War[];
  readonly episodes: readonly Episode[];
  readonly nativeRows: readonly Readonly<AtlasData['nativeRows'][number]>[];
  readonly manifest: Readonly<AtlasData['manifest']>;
  readonly sources: readonly Readonly<SourceRecord>[];
  readonly placementRegistry: readonly Readonly<AtlasData['placementRegistry'][number]>[];
}

const historicEnglishNames: Readonly<Record<string, string>> = {
  ww1: 'First World War',
  ww2: 'Second World War',
  'us-civil': 'American Civil War',
  korea: 'Korean War',
};

function readAnchor(placement: Placement | undefined): Anchor | null {
  if (
    placement?.review_status !== 'reviewed_source_anchor'
    || placement.latitude === null
    || placement.longitude === null
  ) return null;

  return {
    latitude: placement.latitude,
    longitude: placement.longitude,
    precision: 'illustrative_region',
    label: placement.label_ru,
    basis: placement.basis,
    sourceUrl: placement.source_url,
  };
}

function readBattleEstimate(summary: ConflictSummary, source: SourceRecord): Estimate {
  const { best, low, high, missingCounts } = summary;
  return {
    metric: 'battle_related_deaths',
    qualifier: best === null ? 'unknown' : 'reported',
    value: best,
    low,
    high,
    comparisonKey: best !== null && missingCounts.best === 0 ? `ucdp-brd:${source.version}:best` : null,
    source: { title: source.title, url: source.source_url, version: source.version, accessedOn: source.accessed_on },
    scope: 'Боевые потери UCDP за годы наблюдения, по одной строке на конфликт и год.',
    uncertainty: 'Лучшее, нижнее и верхнее значения источника отражают неопределённость оценки. Условная точка не показывает распределение потерь.',
    missingCounts,
  };
}

function readHistoricEstimate(record: HistoricalHighlight): Estimate {
  const qualifier = record.estimate_kind === 'approximate'
    ? (record.value === null ? 'unknown' : 'approximate')
    : (record.low === null ? 'unknown' : (record.lower_exclusive ? 'more-than' : 'at-least'));
  return {
    metric: record.metric,
    qualifier,
    value: record.value,
    low: record.low,
    high: record.high,
    comparisonKey: null,
    source: {
      title: record.source_title,
      url: record.source_url,
      locator: record.source_locator,
      accessedOn: record.accessed_on,
    },
    scope: record.scope_ru,
    uncertainty: record.uncertainty_ru,
    displayRu: record.display_ru,
  };
}

/** Read the permitted, versioned atlas input. Episodes enter separately after source review. */
export function readCatalog(episodes: readonly Episode[] = []): Catalog {
  const data = loadAtlasData();
  const placements = new Map(data.placements.map(placement => [placement.placement_id, placement]));
  const battleSource = data.sources.find(source => source.source_id === 'ucdp-brd-26.1-conflict');
  if (!battleSource) throw new Error('Missing UCDP Battle-Related Deaths source');

  const wars: War[] = data.conflicts.map(summary => {
    const id: WarId = `ucdp:${summary.id}`;
    return {
      id,
      name: summary.name,
      names: { ru: summary.name, en: summary.name },
      period: { from: summary.firstObservedYear, to: summary.lastObservedYear },
      estimate: readBattleEstimate(summary, battleSource),
      anchor: readAnchor(placements.get(id)),
      sourceKind: 'ucdp',
      rowIds: summary.rowIds,
    };
  });

  for (const record of data.historicalHighlights) {
    const id: WarId = `history:${record.highlight_id}`;
    wars.push({
      id,
      name: record.name_ru,
      names: { ru: record.name_ru, en: historicEnglishNames[record.highlight_id] ?? record.name_ru },
      period: { from: record.start_year, to: record.end_year },
      estimate: readHistoricEstimate(record),
      anchor: readAnchor(placements.get(id)),
      sourceKind: 'history',
      rowIds: [],
    });
  }

  const warIds = new Set(wars.map(({ id }) => id));
  const episodeIds = new Set<string>();
  for (const episode of episodes) {
    if (!warIds.has(episode.warId)) throw new Error(`Unknown parent war: ${episode.warId}`);
    const key = `${episode.warId}/${episode.episodeId}`;
    if (episodeIds.has(key)) throw new Error(`Duplicate episode: ${key}`);
    episodeIds.add(key);
  }

  return {
    wars,
    episodes: [...episodes],
    nativeRows: data.nativeRows,
    manifest: data.manifest,
    sources: data.sources,
    placementRegistry: data.placementRegistry,
  };
}

export function selectMapPlacements(catalog: Catalog): MapPlacement[] {
  const byWar = new Map<WarId, MapPlacement[]>();
  for (const episode of catalog.episodes) {
    if (!episode.anchor) continue;
    const flags = byWar.get(episode.warId) ?? [];
    flags.push({
      flagId: `episode:${episode.warId}/${encodeURIComponent(episode.episodeId)}`,
      warId: episode.warId,
      episodeId: episode.episodeId,
      anchor: episode.anchor,
      estimate: episode.estimate,
      names: episode.names,
      sourceKind: episode.warId.startsWith('ucdp:') ? 'ucdp' : 'history',
    });
    byWar.set(episode.warId, flags);
  }

  return catalog.wars.flatMap(war => {
    const episodes = byWar.get(war.id);
    if (episodes) return episodes;
    if (!war.anchor) return [];
    return [{
      flagId: `war:${war.id}`,
      warId: war.id,
      episodeId: null,
      anchor: war.anchor,
      estimate: war.estimate,
      names: war.names,
      sourceKind: war.sourceKind,
    }];
  });
}

/** Group flags by source years. Keep the estimates attached to their original source periods. */
export function mapPlacementsByYear(catalog: Catalog, placements: readonly MapPlacement[]) {
  const observedYears = new Map<string, Set<number>>();
  for (const row of catalog.nativeRows) {
    const id = `ucdp:${row.conflict_id}`;
    const years = observedYears.get(id) ?? new Set<number>();
    years.add(row.year);
    observedYears.set(id, years);
  }
  const wars = new Map(catalog.wars.map(war => [war.id, war]));
  const episodes = new Map(catalog.episodes.map(episode => [`${episode.warId}/${episode.episodeId}`, episode]));
  const result = new Map<number, MapPlacement[]>();
  for (const placement of placements) {
    const episode = episodes.get(`${placement.warId}/${placement.episodeId}`);
    const period = episode?.period ?? wars.get(placement.warId)?.period;
    const years = episode || placement.sourceKind === 'history'
      ? period && Array.from({ length: period.to - period.from + 1 }, (_, index) => period.from + index)
      : observedYears.get(placement.warId);
    for (const year of years ?? []) {
      const entries = result.get(year) ?? [];
      entries.push(placement);
      result.set(year, entries);
    }
  }
  return result;
}

export function compareEstimates(left: Estimate, right: Estimate): number | null {
  if (
    left.comparisonKey === null || left.comparisonKey !== right.comparisonKey
    || left.metric !== right.metric
    || left.qualifier === 'unknown' || right.qualifier === 'unknown'
    || left.value === null || right.value === null
  ) return null;

  return Math.sign(left.value - right.value);
}
