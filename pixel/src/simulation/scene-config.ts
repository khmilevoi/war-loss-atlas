import type { Estimate, War, WarId } from '../catalog';
import type { Locale, sceneTerrainCopy } from '../i18n/atlas-copy';
import type { SceneAssetId } from '../resources/sprite-assets';
import type { BattleDeployment, BattleDeploymentUnit, BattleScenarioId } from './battle';
import type { LandscapeKind } from './landscape';
import { scenarios, type BattleBiome, type BattleScenario } from './roster';
import { allocateUnitPlan, allocateWaves, MAX_ILLUSTRATIVE_UNITS, MIN_ILLUSTRATIVE_UNITS } from './unit-calibration';

interface ForceProfile {
  readonly preferredWaves: number;
  readonly firstSideShare: number;
  readonly referenceCeiling?: number;
  readonly supportShare?: number;
}

export type IllustrativeEra = 'cold-war-neutral' | 'contemporary-neutral';

interface SceneIdentity {
  readonly id: string;
  readonly warId: WarId;
  readonly episodeId?: string;
  readonly terrain?: {
    readonly copyKey: keyof typeof sceneTerrainCopy.en;
    readonly source: Readonly<Record<Locale, string>>;
  };
}

export interface BattleSceneDefinition extends SceneIdentity {
  readonly action?: undefined;
  readonly assets: SceneAssetId;
  readonly scenario: BattleScenarioId;
  readonly seed: number;
  readonly illustrativeEra?: IllustrativeEra;
  readonly aftermathAt?: number;
  readonly aftermathDuration?: number;
  readonly biome?: BattleBiome;
  readonly forces?: ForceProfile;
  readonly landscape?: LandscapeKind;
}

export interface ActionSceneDefinition extends SceneIdentity {
  readonly action: 'air-strikes' | 'maritime' | 'patrol-contact';
  readonly scenario?: undefined;
  readonly assets?: undefined;
  readonly illustrativeEra?: undefined;
}

export type SceneDefinition = BattleSceneDefinition | ActionSceneDefinition;

export const atlasScenes = [
  {
    id: 'ww1-western-front', warId: 'history:ww1', assets: 'ww1-western-front',
    scenario: 'western-front', seed: 1918,
    forces: { referenceCeiling: 30_000_000, preferredWaves: 7, firstSideShare: 52 },
    terrain: {
      copyKey: 'ww1-western-front',
      source: {
        ru: 'https://www.nam.ac.uk/explore/first-world-war#the-western-front',
        en: 'https://www.nam.ac.uk/explore/first-world-war#the-western-front',
      },
    },
  },
  {
    id: 'ww1-palestine', warId: 'history:ww1', episodeId: 'beersheba', assets: 'ww1-palestine',
    scenario: 'palestine', seed: 19171031,
    forces: { preferredWaves: 6, firstSideShare: 55 },
    terrain: {
      copyKey: 'ww1-palestine',
      source: {
        ru: 'https://www.awm.gov.au/visit/exhibitions/anzac-voices/sinai-palestine',
        en: 'https://www.awm.gov.au/visit/exhibitions/anzac-voices/sinai-palestine',
      },
    },
  },
  {
    id: 'us-civil-south-carolina', warId: 'history:us-civil', assets: 'us-civil-south-carolina',
    scenario: 'south-carolina', seed: 1863,
    forces: { referenceCeiling: 1_200_000, preferredWaves: 6, firstSideShare: 55 },
    terrain: {
      copyKey: 'us-civil-south-carolina',
      source: {
        ru: 'https://www.nps.gov/articles/the-54th-massachusetts-and-the-second-battle-of-fort-wagner.htm',
        en: 'https://www.nps.gov/articles/the-54th-massachusetts-and-the-second-battle-of-fort-wagner.htm',
      },
    },
  },
  {
    id: 'korea-osan', warId: 'history:korea', assets: 'korea-osan',
    scenario: 'korea-osan', seed: 19500705,
    forces: { referenceCeiling: 4_000_000, preferredWaves: 8, firstSideShare: 40 },
    terrain: {
      copyKey: 'korea-osan',
      source: {
        ru: 'https://www.army.mil/article/83003/',
        en: 'https://www.army.mil/article/83003/',
      },
    },
  },
  {
    id: 'gulf-war-ground-campaign', warId: 'ucdp:371', assets: 'cold-war-neutral',
    scenario: 'cold-war-neutral', seed: 1991,
    terrain: {
      copyKey: 'gulf-war-ground-campaign',
      source: {
        ru: 'https://history.state.gov/milestones/1989-1992/gulf-war',
        en: 'https://history.state.gov/milestones/1989-1992/gulf-war',
      },
    },
  },
  {
    id: 'iraq-invasion', warId: 'ucdp:420', assets: 'contemporary-neutral',
    scenario: 'contemporary-neutral', seed: 2003,
    terrain: {
      copyKey: 'iraq-invasion',
      source: {
        ru: 'https://www.loc.gov/collections/iraq-war-2003-web-archive/about-this-collection/',
        en: 'https://www.loc.gov/collections/iraq-war-2003-web-archive/about-this-collection/',
      },
    },
  },
  {
    id: 'galwan-contact', warId: 'ucdp:274', action: 'patrol-contact',
    terrain: {
      copyKey: 'galwan-contact',
      source: {
        ru: 'https://www.uscc.gov/research/conflict-sino-indian-border-background-congress',
        en: 'https://www.uscc.gov/research/conflict-sino-indian-border-background-congress',
      },
    },
  },
  {
    id: 'iran-israel-strikes', warId: 'ucdp:14609', action: 'air-strikes',
    terrain: {
      copyKey: 'iran-israel-strikes',
      source: {
        ru: 'https://digitallibrary.un.org/record/4084933/files/S_PV.9939-EN.pdf',
        en: 'https://digitallibrary.un.org/record/4084933/files/S_PV.9939-EN.pdf',
      },
    },
  },
  {
    id: 'red-sea-operations', warId: 'ucdp:16099', action: 'maritime',
    terrain: {
      copyKey: 'red-sea-operations',
      source: {
        ru: 'https://commonslibrary.parliament.uk/research-briefings/cbp-9930/',
        en: 'https://commonslibrary.parliament.uk/research-briefings/cbp-9930/',
      },
    },
  },
  {
    id: 'israel-yemen-strikes', warId: 'ucdp:16470', action: 'air-strikes',
    terrain: {
      copyKey: 'israel-yemen-strikes',
      source: {
        ru: 'https://www.un.org/sg/en/content/highlight/2025-07-21.html',
        en: 'https://www.un.org/sg/en/content/highlight/2025-07-21.html',
      },
    },
  },
  {
    id: 'ww2-overview', warId: 'history:ww2', assets: 'ww2-overview',
    scenario: 'eastern-front', seed: 1943, biome: 'ruins',
    forces: { referenceCeiling: 65_000_000, preferredWaves: 5, firstSideShare: 60, supportShare: 0 },
    terrain: {
      copyKey: 'ww2-overview',
      source: {
        ru: 'https://encyclopedia.ushmm.org/content/ru/article/the-soviet-union-and-the-eastern-front',
        en: 'https://encyclopedia.ushmm.org/content/en/article/the-soviet-union-and-the-eastern-front',
      },
    },
  },
  {
    id: 'hiroshima', warId: 'history:ww2', episodeId: 'hiroshima', assets: 'hiroshima',
    scenario: 'pacific-symbolic', seed: 19450806, landscape: 'ota-delta',
    aftermathAt: 6400, aftermathDuration: 3000,
    terrain: {
      copyKey: 'hiroshima',
      source: {
        ru: 'https://www.city.hiroshima.lg.jp/english/overview/1029882/1009928.html',
        en: 'https://www.city.hiroshima.lg.jp/english/overview/1029882/1009928.html',
      },
    },
  },
  {
    id: 'nagasaki', warId: 'history:ww2', episodeId: 'nagasaki', assets: 'nagasaki',
    scenario: 'pacific-symbolic', seed: 19450809, landscape: 'urakami-valley',
    aftermathAt: 8400, aftermathDuration: 3200,
    terrain: {
      copyKey: 'nagasaki',
      source: {
        ru: 'https://nagasakipeace.jp/en/search/record/photo/part_2_01.html',
        en: 'https://nagasakipeace.jp/en/search/record/photo/part_2_01.html',
      },
    },
  },
] as const satisfies readonly SceneDefinition[];

interface IllustrativeScene extends BattleSceneDefinition {
  readonly illustrativeEra: IllustrativeEra;
}

export function resolveIllustrativeScenes(war: Pick<War, 'id' | 'period'>): readonly IllustrativeScene[] {
  if (!war.id.startsWith('ucdp:') || resolveCardScene(atlasScenes, war.id)) return [];

  // The assignment matrix uses these eras to organize artwork. A mixed
  // observation period gets two independent fields, with the later one first.
  const eras: IllustrativeEra[] = [];
  if (war.period.to >= 1992) eras.push('contemporary-neutral');
  if (war.period.from < 1992) eras.push('cold-war-neutral');
  return eras.map(era => ({
    id: era, warId: war.id, assets: era, scenario: era,
    seed: Number(war.id.slice('ucdp:'.length)), illustrativeEra: era,
  }));
}

function historicalUnitTotal(estimate: Pick<Estimate, 'value' | 'low' | 'qualifier'>, ceiling?: number) {
  const lowerBound = estimate.qualifier === 'more-than' || estimate.qualifier === 'at-least';
  const reference = lowerBound ? estimate.low : estimate.value;
  if (estimate.qualifier === 'unknown' || reference === null || !Number.isSafeInteger(reference) || reference < 0) {
    return MIN_ILLUSTRATIVE_UNITS;
  }
  if (reference === 0 && !lowerBound) return 0;
  const scale = ceiling === undefined ? 0 : Math.min(reference / ceiling, 1);
  return MIN_ILLUSTRATIVE_UNITS + Math.round(scale * (MAX_ILLUSTRATIVE_UNITS - MIN_ILLUSTRATIVE_UNITS));
}

function distributeRoster(team: BattleScenario['teams'][number], waveSizes: readonly number[], supportShare: number) {
  const vehicleShare = team.vehicles.length ? 20 : 0;
  const support = team.support.length ? supportShare : 0;
  const roster = [
    ...team.vehicles.map(sprite => ({ unit: { sprite }, share: vehicleShare / team.vehicles.length })),
    ...team.fighters.map(sprite => ({ unit: { sprite }, share: (100 - vehicleShare - support) / team.fighters.length })),
    ...team.support.map(sprite => ({ unit: { sprite, support: true }, share: support / team.support.length })),
  ];
  const total = waveSizes.reduce((sum, count) => sum + count, 0);
  const remaining = allocateUnitPlan(total, roster.map(({ share }) => share));
  return waveSizes.map(count => {
    if (count === 0) return [];
    const allocation = allocateUnitPlan(count, remaining);
    return roster.flatMap(({ unit }, index) => {
      remaining[index] -= allocation[index];
      return Array<BattleDeploymentUnit>(allocation[index]).fill(unit);
    });
  });
}

export function createSceneDeployment(
  scene: BattleSceneDefinition,
  estimate: Pick<Estimate, 'value' | 'low' | 'qualifier'>,
  calibratedUnits?: number | null,
): BattleDeployment | undefined {
  if (scene.scenario === 'pacific-symbolic') return undefined;
  const { preferredWaves = 5, firstSideShare = 50, referenceCeiling, supportShare = 10 } = scene.forces ?? {};
  const total = scene.warId.startsWith('ucdp:')
    ? calibratedUnits ?? MIN_ILLUSTRATIVE_UNITS
    : historicalUnitTotal(estimate, referenceCeiling);
  const waves = allocateWaves(total, preferredWaves, [firstSideShare, 100 - firstSideShare]);
  const [first, second] = scenarios[scene.scenario].teams;
  const firstSide = distributeRoster(first, waves.map(wave => wave[0]), supportShare);
  const secondSide = distributeRoster(second, waves.map(wave => wave[1]), supportShare);
  return waves.map((_, index) => [firstSide[index], secondSide[index]]);
}

export function createActionWaves(scene: ActionSceneDefinition, calibratedUnits: number | null) {
  // These are proportions of visual elements in schematic playback.
  const profiles = {
    'air-strikes': { preferredWaves: 6, shares: [55, 45] },
    maritime: { preferredWaves: 7, shares: [45, 55] },
    'patrol-contact': { preferredWaves: 8, shares: [50, 50] },
  } as const;
  const { preferredWaves, shares } = profiles[scene.action];
  return allocateWaves(calibratedUnits ?? MIN_ILLUSTRATIVE_UNITS, preferredWaves, shares);
}

export function resolveCardScene(
  scenes: readonly SceneDefinition[], warId: WarId, episodeId?: string | null,
): SceneDefinition | null {
  const selected = episodeId ? scenes.find(scene => scene.warId === warId && scene.episodeId === episodeId) : undefined;
  return selected ?? scenes.find(scene => scene.warId === warId && scene.episodeId === undefined) ?? null;
}
