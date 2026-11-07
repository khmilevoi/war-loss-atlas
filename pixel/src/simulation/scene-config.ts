import type { WarId } from '../catalog';
import type { Locale, sceneTerrainCopy } from '../i18n/atlas-copy';
import type { SceneAssetId } from '../resources/sprite-assets';
import type { BattleScenarioId } from './battle';
import type { LandscapeKind } from './landscape';

export interface SceneDefinition {
  readonly id: string;
  readonly warId: WarId;
  readonly episodeId?: string;
  readonly assets: SceneAssetId;
  readonly scenario: BattleScenarioId;
  readonly seed: number;
  readonly aftermathAt?: number;
  readonly aftermathDuration?: number;
  readonly finaleAt?: number;
  readonly landscape?: LandscapeKind;
  readonly terrain?: {
    readonly copyKey: keyof typeof sceneTerrainCopy.en;
    readonly source: Readonly<Record<Locale, string>>;
  };
}

export const atlasScenes = [
  {
    id: 'ww2-overview', warId: 'history:ww2', assets: 'ww2-overview',
    scenario: 'eastern-front', seed: 1943, finaleAt: 24000,
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

export function resolveCardScene(
  scenes: readonly SceneDefinition[], warId: WarId, episodeId?: string | null,
): SceneDefinition | null {
  const selected = episodeId ? scenes.find(scene => scene.warId === warId && scene.episodeId === episodeId) : undefined;
  return selected ?? scenes.find(scene => scene.warId === warId && scene.episodeId === undefined) ?? null;
}
