import { describe, expect, it } from 'vitest';
import { readCatalog } from '../src/catalog';
import { atlasScenes, createActionWaves, createSceneDeployment, resolveCardScene, resolveIllustrativeScenes, type SceneDefinition } from '../src/simulation/scene-config';

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

  it('allocates the WWII lower-bound reference to five waves with the authored mix', () => {
    const war = readCatalog().wars.find(war => war.id === 'history:ww2')!;
    const scene = resolveCardScene(atlasScenes, war.id);
    if (!scene || scene.action) throw new Error('Expected a ground battle');
    const waves = createSceneDeployment(scene, war.estimate)!;
    expect(waves.map(([first, second]) => [first.length, second.length])).toEqual(Array(5).fill([12, 8]));
    const first = waves.flatMap(wave => wave[0]);
    const second = waves.flatMap(wave => wave[1]);
    expect(first.filter(unit => unit.sprite === 't34')).toHaveLength(12);
    expect(second.filter(unit => unit.sprite === 'stug')).toHaveLength(8);
    expect(waves.every(wave => wave[0].some(unit => unit.sprite === 't34') && wave[1].some(unit => unit.sprite === 'stug'))).toBe(true);
    expect([...first, ...second].some(unit => unit.support)).toBe(false);
  });

  it('scales the historic scenes independently and preserves roster support roles', () => {
    const wars = readCatalog().wars;
    const plan = (id: 'history:ww1' | 'history:us-civil' | 'history:korea') => {
      const scene = resolveCardScene(atlasScenes, id);
      if (!scene || scene.action) throw new Error('Expected a ground battle');
      return createSceneDeployment(scene, wars.find(war => war.id === id)!.estimate)!;
    };
    expect(plan('history:ww1').flat(2)).toHaveLength(58);
    expect(plan('history:us-civil').flat(2)).toHaveLength(66);
    const korea = plan('history:korea');
    expect(korea.flat(2)).toHaveLength(55);
    expect(korea.flatMap(wave => wave[0])).toHaveLength(22);
    expect(korea.flat(2)).toContainEqual({ sprite: 'osan-medic', support: true });
  });

  it('keeps unknown estimates illustrative, confirmed zero empty, and nuclear openings authored', () => {
    const unknown = { qualifier: 'unknown', value: null, low: null } as const;
    const zero = { qualifier: 'reported', value: 0, low: null } as const;
    const beersheba = resolveCardScene(atlasScenes, 'history:ww1', 'beersheba');
    const hiroshima = resolveCardScene(atlasScenes, 'history:ww2', 'hiroshima');
    if (!beersheba || beersheba.action || !hiroshima || hiroshima.action) throw new Error('Expected ground scenes');
    expect(createSceneDeployment(beersheba, unknown)!.flat(2)).toHaveLength(10);
    expect(createSceneDeployment(beersheba, { qualifier: 'more-than', value: null, low: 0 })!.flat(2)).toHaveLength(10);
    expect(createSceneDeployment(beersheba, zero)).toEqual([]);
    expect(createSceneDeployment(hiroshima, unknown, 100)).toBeUndefined();
    const generic = resolveIllustrativeScenes({ id: 'ucdp:251', period: { from: 2000, to: 2005 } })[0];
    expect(createSceneDeployment(generic, unknown, null)!.flat(2)).toHaveLength(10);
    expect(createSceneDeployment(generic, zero, 0)).toEqual([]);
    const scaled = createSceneDeployment(generic, { ...zero, value: 12000 }, 77)!;
    expect(scaled.flatMap(wave => wave[0])).toHaveLength(39);
    expect(scaled.flatMap(wave => wave[1])).toHaveLength(38);
  });

  it.each([
    ['ucdp:14609', 6, 55],
    ['ucdp:16099', 7, 45],
    ['ucdp:274', 8, 50],
  ] as const)('allocates an independent action profile for %s', (id, waveCount, firstSide) => {
    const scene = resolveCardScene(atlasScenes, id);
    if (!scene?.action) throw new Error('Expected a schematic action scene');
    const waves = createActionWaves(scene, 100);
    expect(waves).toHaveLength(waveCount);
    expect(waves.reduce((total, [first]) => total + first, 0)).toBe(firstSide);
    expect(waves.reduce((total, [first, second]) => total + first + second, 0)).toBe(100);
    expect(createActionWaves(scene, null).flat().reduce((total, count) => total + count, 0)).toBe(10);
    expect(createActionWaves(scene, 0)).toEqual([]);
  });
});
