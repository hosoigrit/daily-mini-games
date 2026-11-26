import type { Judgement } from '../contracts/interface_contracts';

export const goodWindowUs = 150_000;

export function classifyTimingError(errorUs: number): Exclude<Judgement, 'MISS'> | null {
  if (!Number.isSafeInteger(errorUs)) return null;
  const absolute = Math.abs(errorUs);
  if (absolute <= 50_000) return 'PERFECT';
  if (absolute <= 100_000) return 'GREAT';
  return absolute <= goodWindowUs ? 'GOOD' : null;
}
