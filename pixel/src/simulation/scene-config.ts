import type { Estimate, War, WarId } from '../catalog';
import type { Locale, sceneTerrainCopy } from '../i18n/atlas-copy';
import type { SceneAssetId } from '../resources/sprite-assets';
import type { BattleDeployment, BattleScenarioId } from './battle';
import type { LandscapeKind } from './landscape';
import type { BattleBiome } from './roster';
import { allocateUnitPlan } from './unit-calibration';

interface ForceMix {
  readonly share: number;
  readonly units: readonly { readonly sprite: string; readonly share: number }[];
}

export type IllustrativeEra = 'cold-war-neutral' | 'contemporary-neutral';

export interface SceneDefinition {
  readonly id: string;
  readonly warId: WarId;
  readonly episodeId?: string;
  readonly assets: SceneAssetId;
  readonly scenario: BattleScenarioId;
  readonly seed: number;
  readonly illustrativeEra?: IllustrativeEra;
  readonly aftermathAt?: number;
  readonly aftermathDuration?: number;
  readonly biome?: BattleBiome;
  readonly forces?: {
    readonly deathsPerUnit: number;
    readonly maxUnits: number;
    readonly sides: readonly [ForceMix, ForceMix];
  };
  readonly landscape?: LandscapeKind;
  readonly terrain?: {
    readonly copyKey: keyof typeof sceneTerrainCopy.en;
    readonly source: Readonly<Record<Locale, string>>;
  };
}

export const atlasScenes = [
  {
    id: 'ww1-western-front', warId: 'history:ww1', assets: 'ww1-western-front',
    scenario: 'western-front', seed: 1918,
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
    terrain: {
      copyKey: 'us-civil-south-carolina',
      source: {
        ru: 'https://www.nps.gov/articles/the-54th-massachusetts-and-the-second-battle-of-fort-wagner.htm',
        en: 'https://www.nps.gov/articles/the-54th-massachusetts-and-the-second-battle-of-fort-wagner.htm',
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
    id: 'ww2-overview', warId: 'history:ww2', assets: 'ww2-overview',
    scenario: 'eastern-front', seed: 1943, biome: 'ruins',
    forces: {
      deathsPerUnit: 4_000_000, maxUnits: 20,
      sides: [
        { share: 60, units: [{ sprite: 't34', share: 20 }, { sprite: 'soviet-sniper', share: 80 }] },
        { share: 40, units: [{ sprite: 'stug', share: 20 }, { sprite: 'german-1943', share: 80 }] },
      ],
    },
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

// The ranged infantry scene is unsuitable for the documented hand-to-hand,
// air, missile or naval actions in these cards.
export const groundSceneExceptions: ReadonlySet<WarId> = new Set([
  'ucdp:274', 'ucdp:14609', 'ucdp:16099', 'ucdp:16470',
]);

interface IllustrativeScene extends SceneDefinition {
  readonly illustrativeEra: IllustrativeEra;
}

export function resolveIllustrativeScenes(war: Pick<War, 'id' | 'period'>): readonly IllustrativeScene[] {
  if (!war.id.startsWith('ucdp:') || groundSceneExceptions.has(war.id)) return [];

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

export function createSceneDeployment(
  scene: SceneDefinition, estimate: Pick<Estimate, 'value' | 'low' | 'qualifier'>,
): BattleDeployment | undefined {
  const { forces } = scene;
  if (!forces) return undefined;
  const reference = estimate.qualifier === 'more-than' || estimate.qualifier === 'at-least'
    ? estimate.low : estimate.value;
  if (estimate.qualifier === 'unknown' || reference === null || reference <= 0) return [[], []];

  const total = Math.min(forces.maxUnits, Math.max(2, Math.floor(reference / forces.deathsPerUnit)));
  const counts = allocateUnitPlan(total, forces.sides.map(side => side.share));
  function deploy(side: ForceMix, count: number) {
    const units = allocateUnitPlan(count, side.units.map(unit => unit.share));
    return side.units.flatMap(({ sprite }, index) => Array<string>(units[index]).fill(sprite));
  }
  const [first, second] = forces.sides;
  return [deploy(first, counts[0]), deploy(second, counts[1])];
}

export function resolveCardScene(
  scenes: readonly SceneDefinition[], warId: WarId, episodeId?: string | null,
): SceneDefinition | null {
  const selected = episodeId ? scenes.find(scene => scene.warId === warId && scene.episodeId === episodeId) : undefined;
  return selected ?? scenes.find(scene => scene.warId === warId && scene.episodeId === undefined) ?? null;
}
