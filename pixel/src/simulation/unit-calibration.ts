import type { Estimate } from '../catalog';

export type CalibrationEstimate = Pick<Estimate, 'metric' | 'comparisonKey' | 'qualifier' | 'value'>;

const MIN_POSITIVE_PLAN = 16;

function comparableValue(estimate: CalibrationEstimate) {
  const { value, metric, comparisonKey, qualifier } = estimate;
  if (!comparisonKey || value === null || !Number.isSafeInteger(value) || value < 0
    || (qualifier !== 'reported' && qualifier !== 'approximate')) return null;
  return { key: JSON.stringify([metric, comparisonKey]), value };
}

/** Rank distinct recorded values only inside the same verified metric and scope group. */
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
    let next = MIN_POSITIVE_PLAN;
    const ordered = [...values].sort((left, right) => left - right);
    plans.set(key, new Map(ordered.map(value => [value, value === 0 ? 0 : next++])));
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
