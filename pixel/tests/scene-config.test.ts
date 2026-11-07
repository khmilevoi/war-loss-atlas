import { describe, expect, it } from 'vitest';
import { atlasScenes, resolveCardScene, type SceneDefinition } from '../src/simulation/scene-config';

describe('scene configuration', () => {
  const extra = {
    id: 'extra', warId: 'history:korea', scenario: 'eastern-front', seed: 1950,
    assets: 'ww2-overview',
  } as const satisfies SceneDefinition;
  const extraEpisode = {
    ...extra, id: 'extra-episode', episodeId: 'extra-episode', seed: 1951,
  } as const satisfies SceneDefinition;
  const scenes = [...atlasScenes, extra, extraEpisode];

  it('selects scenes from configuration for a new card or a new episode', () => {
    expect(resolveCardScene(scenes, 'history:korea')).toBe(extra);
    expect(resolveCardScene(scenes, 'history:korea', 'extra-episode')).toBe(extraEpisode);
  });

  it('keeps the explicitly labelled overview for an episode without a scene', () => {
    expect(resolveCardScene(scenes, 'history:korea', 'other')).toBe(extra);
    expect(resolveCardScene(scenes, 'ucdp:205', 'extra-episode')).toBeNull();
    expect(resolveCardScene(scenes, 'history:ww2', 'nagasaki')?.assets).toBe('nagasaki');
  });

  it.each([
    ['history:ww1', null, 'western-front'],
    ['history:ww1', 'beersheba', 'palestine'],
    ['history:us-civil', null, 'south-carolina'],
    ['ucdp:371', null, 'cold-war-neutral'],
    ['ucdp:420', null, 'contemporary-neutral'],
  ] as const)('resolves the configured scenario for %s / %s', (warId, episodeId, scenario) => {
    expect(resolveCardScene(atlasScenes, warId, episodeId)?.scenario).toBe(scenario);
  });
});
