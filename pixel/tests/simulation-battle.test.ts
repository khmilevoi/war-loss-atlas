import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../src/catalog';
import { createBattle, type BattleCue, type BattleScenarioId } from '../src/simulation/battle';
import { atlasScenes, createSceneDeployment, resolveCardScene } from '../src/simulation/scene-config';

const originalSnapshots: Partial<Record<BattleScenarioId, readonly string[]>> = {
  'south-carolina': ['effe256c58fa', '99ecfee80b10', '51edb1a5a0d8', '17ca1d62760c'],
  palestine: ['84035763e170', 'ffdc1496082d', '4a0db4036361', '3c3cbb7bf7fd'],
  'western-front': ['132a7438be47', 'c86c555aeced', '36368d456dff', '732210ba5cc6'],
  'eastern-front': ['8838917ea3ca', '54f788c82f4c', '650b46913c96', '9c373ff7886d'],
  'tank-battle': ['811c892a5ace', 'aa4aa1964ddf', 'a6acf8e88863', 'acd861729244'],
  vietnam: ['6f87f94b09cc', '5375605ad7c8', '09695e9e5ef4', 'c02b6aab95d9'],
};

const hash = (snapshot: unknown) =>
  createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 12);

describe('deterministic battle core', () => {
  it.each(Object.entries(originalSnapshots))('matches frozen %s snapshots', (scenario, expected) => {
    const cues: BattleCue[] = [];
    const battle = createBattle({ scenario: scenario as BattleScenarioId, seed: 1846, onCue: cue => cues.push(cue) });
    const hashes = [hash(battle.snapshot())];
    for (const ticks of [250, 500, 1500]) {
      for (let index = 0; index < ticks; index++) battle.step(40);
      hashes.push(hash(battle.snapshot()));
    }
    expect(hashes).toEqual(expected);
    expect(new Set(cues)).toEqual(new Set(['rifle', 'cannon', 'explosion']));
    battle.reset();
    expect(hash(battle.snapshot())).toBe(expected[0]);
  });

  it.each([[false, 1880], [true, 480]] as const)(
    'keeps the original manual effect timing with reduced motion set to %s',
    (reducedMotion, peak) => {
      const cues: BattleCue[] = [];
      const battle = createBattle({ scenario: 'tank-battle', seed: 1846, reducedMotion, onCue: cue => cues.push(cue) });
      expect(battle.triggerNuke()).toBe(true);
      expect(battle.triggerNuke()).toBe(false);
      expect(battle.snapshot().units).toHaveLength(0);
      for (let time = 40; time < peak; time += 40) battle.step(40);
      expect(battle.snapshot().terrain.biome).toBe('snow');
      battle.step(40);
      expect(battle.snapshot().nuke.whiteout).toBe(1);
      expect(battle.snapshot().terrain.biome).toBe('ruins');
      for (let time = peak + 40; time <= 3000; time += 40) battle.step(40);
      expect(battle.snapshot().nuke.active).toBe(false);
      expect(battle.snapshot().units).toHaveLength(14);
      expect(cues).toEqual(['nuke']);
    },
  );
  it('keeps troops and damage through a scripted episode without redeploying', () => {
    const battle = createBattle({ scenario: 'pacific-symbolic', seed: 19450806 });
    for (let time = 40; time <= 6000; time += 40) battle.step(40);
    const before = battle.snapshot().units;
    expect(before.length).toBeGreaterThan(0);
    expect(battle.triggerNuke('aftermath')).toBe(true);
    expect(battle.snapshot().units).toEqual(before);
    battle.step(3200);
    expect(battle.frame().finished).toBe(true);
    expect(battle.snapshot().terrain.biome).toBe('ruins');
    expect(battle.snapshot().units).toEqual(before);
    const terminal = battle.snapshot();
    battle.step(400);
    expect(battle.snapshot()).toEqual(terminal);
    battle.reset();
    expect(battle.frame().finished).toBe(false);
    expect(battle.snapshot().time).toBe(0);
  });

  it('leaves a static aftermath without a white flash in reduced motion', () => {
    const battle = createBattle({ scenario: 'pacific-symbolic', reducedMotion: true });
    battle.triggerNuke('aftermath');
    for (let time = 40; time <= 3200; time += 40) {
      battle.step(40);
      expect(battle.snapshot().nuke.whiteout).toBe(0);
    }
    expect(battle.frame().finished).toBe(true);
    expect(battle.snapshot().terrain.biome).toBe('ruins');
  });


  it('deploys the calibrated urban overview and settles only after combat decides it', () => {
    const scene = resolveCardScene(atlasScenes, 'history:ww2')!;
    const estimate = readCatalog().wars.find(war => war.id === scene.warId)!.estimate;
    const deployment = createSceneDeployment(scene, estimate);
    expect(deployment?.map(side => side.length)).toEqual([10, 6]);
    expect(createSceneDeployment(scene, { ...estimate, low: 48_000_000 })
      ?.reduce((total, side) => total + side.length, 0)).toBe(12);
    const settled: unknown[] = [];
    const cues: BattleCue[] = [];
    const battle = createBattle({
      ...scene, deployment,
      onSettledBlood: stain => settled.push(stain), onCue: cue => cues.push(cue),
    });
    const initial = battle.snapshot();
    const terrain = battle.frame().terrain;
    expect(battle.frame().biome).toBe('ruins');
    expect(terrain.some(tile => tile.road)).toBe(true);
    expect(initial.units).toHaveLength(16);
    expect(initial.units.filter(unit => unit.sprite === 't34')).toHaveLength(2);
    expect(initial.units.filter(unit => unit.sprite === 'stug')).toHaveLength(1);

    for (let time = 0; time < 120_000 && !battle.frame().finished; time += 40) battle.step(40);
    const frame = battle.frame();
    const terminal = battle.snapshot();
    expect(frame.finished).toBe(true);
    expect(frame.terrain).toBe(terrain);
    expect(new Set(terminal.units.map(unit => unit.team))).toEqual(new Set([0]));
    expect(terminal.units.every(unit => initial.units.some(start => start.id === unit.id))).toBe(true);
    expect(settled.length).toBeGreaterThan(0);
    expect(frame.whiteout).toBe(0);
    expect(cues).not.toContain('nuke');
    battle.step(4000);
    expect(battle.snapshot()).toEqual(terminal);
    battle.reset();
    expect(battle.snapshot()).toEqual(initial);
  });

  it.each(['ota-delta', 'urakami-valley'] as const)(
    'preserves %s topography before and after the episode effect without ground craters',
    (landscape) => {
      const battle = createBattle({ scenario: 'pacific-symbolic', landscape, aftermathDuration: 3200 });
      const initial = battle.frame().landscape;
      expect(initial).toBeDefined();
      expect(initial?.water.length).toBeGreaterThan(20);
      expect(initial?.bridges.length).toBeGreaterThan(0);
      expect(initial?.ridges.length).toBe(landscape === 'ota-delta' ? 0 : 60);
      expect(battle.snapshot().units.length).toBeGreaterThan(0);
      battle.triggerNuke('aftermath');
      battle.step(3040);
      expect(battle.frame().finished).toBe(false);
      battle.step(200);
      expect(battle.frame().finished).toBe(true);
      expect(battle.frame().landscape).toBe(initial);
      expect(battle.frame().craters).toEqual([]);
    },
  );

});
