import type { Estimate } from '../catalog';

export type CalibrationEstimate = Pick<Estimate, 'metric' | 'comparisonKey' | 'qualifier' | 'value'>;

export const MIN_ILLUSTRATIVE_UNITS = 10;
export const MAX_ILLUSTRATIVE_UNITS = 100;
const MAX_UNITS_PER_WAVE = 20;

function comparableValue(estimate: CalibrationEstimate) {
  const { value, metric, comparisonKey, qualifier } = estimate;
  if (!comparisonKey || value === null || !Number.isSafeInteger(value) || value < 0
    || (qualifier !== 'reported' && qualifier !== 'approximate')) return null;
  return { key: JSON.stringify([metric, comparisonKey]), value };
}

/** Scale recorded values logarithmically inside the same verified metric and scope group. */
export function createUnitCalibration(estimates: readonly CalibrationEstimate[]) {
  const groups = new Map<string, Set<number>>();
  for (const estimate of estimates) {
    const entry = comparableValue(estimate);
    if (!entry) continue;
    const group = groups.get(entry.key) ?? new Set<number>();
    group.add(entry.value);
    groups.set(entry.key, group);
  }

  const plans = new Map<string, Map<number, number>>();
  for (const [key, values] of groups) {
    const positive = [...values].filter(value => value > 0);
    const minimum = Math.min(...positive);
    const maximum = Math.max(...positive);
    const logRange = Math.log(maximum / minimum);
    const plan = new Map(positive.map(value => {
      const progress = minimum === maximum ? 0 : Math.log(value / minimum) / logRange;
      const units = MIN_ILLUSTRATIVE_UNITS + Math.round(progress * (MAX_ILLUSTRATIVE_UNITS - MIN_ILLUSTRATIVE_UNITS));
      return [value, units];
    }));
    if (values.has(0)) plan.set(0, 0);
    plans.set(key, plan);
  }

  return (estimate: CalibrationEstimate): number | null => {
    const entry = comparableValue(estimate);
    return entry ? plans.get(entry.key)?.get(entry.value) ?? null : null;
  };
}

/** Allocate whole illustrative units by relative shares, resolving tied remainders in input order. */
export function allocateUnitPlan(total: number, shares: readonly number[]): number[] {
  const weight = shares.reduce((sum, share) => sum + share, 0);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isFinite(weight) || weight <= 0
    || shares.some(share => !Number.isFinite(share) || share < 0)) {
    throw new RangeError('Invalid unit total or shares');
  }
  const quotas = shares.map(share => share / weight * total);
  const allocation = quotas.map(Math.floor);
  const remainder = total - allocation.reduce((sum, count) => sum + count, 0);
  const ordered = quotas.map((quota, index) => ({ index, fraction: quota - allocation[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const { index } of ordered.slice(0, remainder)) allocation[index]++;
  return allocation;
}

/** Balance wave sizes and both sides while preserving the total and cumulative side shares. */
export function allocateWaves(
  total: number, preferredWaveCount: number, sideShares: readonly [number, number],
): readonly (readonly [number, number])[] {
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_ILLUSTRATIVE_UNITS
    || !Number.isSafeInteger(preferredWaveCount) || preferredWaveCount < 1) {
    throw new RangeError('Invalid deployment total or wave count');
  }
  if (total === 0) return [];
  const waveCount = Math.min(total, Math.max(
    Math.ceil(total / MAX_UNITS_PER_WAVE),
    Math.ceil(preferredWaveCount * total / MAX_ILLUSTRATIVE_UNITS),
  ));
  const waveSizes = allocateUnitPlan(total, Array<number>(waveCount).fill(1));
  const [firstTotal] = allocateUnitPlan(total, sideShares);
  const firstSide = allocateUnitPlan(firstTotal, waveSizes);
  return waveSizes.map((size, index) => [firstSide[index], size - firstSide[index]]);
}
