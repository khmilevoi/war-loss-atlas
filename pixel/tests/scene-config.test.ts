import { describe, expect, it } from 'vitest';
import { readCatalog } from '../src/catalog';
import { atlasScenes, resolveCardScene, resolveIllustrativeScenes, type SceneDefinition } from '../src/simulation/scene-config';

describe('scene configuration', () => {
  const extra = {
    id: 'extra', warId: 'ucdp:205', scenario: 'eastern-front', seed: 1950,
    assets: 'ww2-overview',
  } as const satisfies SceneDefinition;
  const extraEpisode = {
    ...extra, id: 'extra-episode', episodeId: 'extra-episode', seed: 1951,
  } as const satisfies SceneDefinition;
  const scenes = [...atlasScenes, extra, extraEpisode];

  it('selects scenes from configuration for a new card or a new episode', () => {
    expect(resolveCardScene(scenes, 'ucdp:205')).toBe(extra);
    expect(resolveCardScene(scenes, 'ucdp:205', 'extra-episode')).toBe(extraEpisode);
  });

  it('keeps the explicitly labelled overview for an episode without a scene', () => {
    expect(resolveCardScene(scenes, 'ucdp:205', 'other')).toBe(extra);
    expect(resolveCardScene(scenes, 'ucdp:220', 'extra-episode')).toBeNull();
    expect(resolveCardScene(scenes, 'history:ww2', 'nagasaki')?.assets).toBe('nagasaki');
  });

  it.each([
    ['history:ww1', null, 'western-front'],
    ['history:ww1', 'beersheba', 'palestine'],
    ['history:us-civil', null, 'south-carolina'],
    ['history:korea', null, 'korea-osan'],
    ['ucdp:371', null, 'cold-war-neutral'],
    ['ucdp:420', null, 'contemporary-neutral'],
  ] as const)('resolves the configured scenario for %s / %s', (warId, episodeId, scenario) => {
    expect(resolveCardScene(atlasScenes, warId, episodeId)?.scenario).toBe(scenario);
  });

  it.each([
    ['ucdp:220', ['cold-war-neutral']],
    ['ucdp:251', ['contemporary-neutral']],
    ['ucdp:205', ['contemporary-neutral', 'cold-war-neutral']],
    ['ucdp:371', []],
    ['ucdp:274', []],
  ] as const)('selects independent era views or keeps the authored scene for %s', (id, expected) => {
    const war = readCatalog().wars.find(war => war.id === id)!;
    expect(resolveIllustrativeScenes(war).map(scene => scene.scenario)).toEqual(expected);
  });

  it('covers every war in the current catalog, including entries without map anchors', () => {
    const { wars } = readCatalog();
    const uncovered = wars.filter(war => !resolveCardScene(atlasScenes, war.id) && !resolveIllustrativeScenes(war).length);
    expect(uncovered.map(war => war.id)).toEqual([]);
  });
});
