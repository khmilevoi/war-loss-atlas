import { describe, expect, it } from 'vitest';
import { readCatalog } from '../src/catalog';
import { ww2Episodes } from '../src/catalog/ww2-episodes';
import { createBattle } from '../src/simulation/battle';
import { allocateUnitPlan, createUnitCalibration, type CalibrationEstimate } from '../src/simulation/unit-calibration';

const sample = (value: number | null, overrides: Partial<CalibrationEstimate> = {}): CalibrationEstimate =>
  ({ metric: 'battle_related_deaths', comparisonKey: 'verified-group', qualifier: 'reported', value, ...overrides });

describe('illustrative unit calibration', () => {
  it('strictly orders distinct known totals inside the real UCDP comparison group', () => {
    const { wars } = readCatalog();
    const estimates = wars.filter(war => war.sourceKind === 'ucdp').map(war => war.estimate);
    const calibration = createUnitCalibration(estimates);
    const sorted = [...estimates].sort((a, b) => (a.value ?? -1) - (b.value ?? -1));
    let distinctPairs = 0;
    for (let i = 1; i < sorted.length; i++) {
      const lower = sorted[i - 1], upper = sorted[i];
      if (lower.value !== upper.value) {
        expect(calibration(upper)).toBeGreaterThan(calibration(lower)!);
        distinctPairs++;
      } else expect(calibration(upper)).toBe(calibration(lower));
    }
    expect(distinctPairs).toBeGreaterThan(150);
  });

  it('keeps absence, bounds, unknown comparisons and confirmed zero distinct', () => {
    const values = [sample(0), sample(20), sample(21)];
    const calibration = createUnitCalibration(values);
    expect(values.map(calibration)).toEqual([0, 16, 17]);
    expect(calibration(sample(null))).toBeNull();
    expect(calibration(sample(20, { qualifier: 'at-least' }))).toBeNull();
    expect(calibration(sample(20, { comparisonKey: null }))).toBeNull();
    expect(calibration(sample(20, { metric: 'civilian_deaths' }))).toBeNull();
    expect(calibration(sample(22))).toBeNull();
  });

  it('leaves the three authored WWII scenes outside the UCDP ordering', () => {
    const { wars, episodes } = readCatalog(ww2Episodes);
    const calibration = createUnitCalibration([...wars, ...episodes].map(card => card.estimate));
    const overview = wars.find(war => war.id === 'history:ww2');
    expect(overview).toBeDefined();
    expect(calibration(overview!.estimate)).toBeNull();
    expect(episodes.map(episode => calibration(episode.estimate))).toEqual([null, null]);
  });

  it('preserves integer totals across rounded set allocations', () => {
    expect(allocateUnitPlan(17, [.55, .30, .15])).toEqual([9, 5, 3]);
    expect(allocateUnitPlan(3, [1, 1])).toEqual([2, 1]);
    expect(allocateUnitPlan(0, [1, 1])).toEqual([0, 0]);
    expect(() => allocateUnitPlan(2, [1, -1])).toThrow(RangeError);
  });

  it('limits actual deployments to the per-team authored plan and resets the budget', () => {
    const battle = createBattle({ scenario: 'tank-battle', seed: 1846, unitBudget: [2, 4] });
    const counts = () => battle.snapshot().units.reduce(
      (teams, unit) => { teams[unit.team]++; return teams; }, [0, 0],
    );
    expect(counts()).toEqual([2, 4]);
    for (let i = 0; i < 2250; i++) battle.step(40);
    expect(battle.snapshot().reinforcements).toBe(0);
    expect(battle.snapshot().units.every(unit => unit.id <= 6)).toBe(true);
    battle.reset();
    expect(counts()).toEqual([2, 4]);
    expect(() => createBattle({ scenario: 'tank-battle', unitBudget: [-1, 2] })).toThrow(RangeError);
  });
});
