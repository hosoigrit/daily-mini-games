import {PART_TYPES} from '../data/part-definitions.js';

export function normalizeUsageRequirement(requirement, inventory) {
  if (requirement === null || requirement === 'slope' || PART_TYPES.includes(requirement)) return requirement;
  if (!requirement || Object.getPrototypeOf(requirement) !== Object.prototype
    || !Object.hasOwn(requirement, 'version') || requirement.version !== 2 || !Object.hasOwn(requirement, 'counts')
    || Object.keys(requirement).length !== 2 || !requirement.counts
    || Object.getPrototypeOf(requirement.counts) !== Object.prototype) {
    throw new TypeError('Invalid usage requirement');
  }
  const entries = Object.entries(requirement.counts);
  if (!entries.length || entries.some(([type, count]) =>
    !PART_TYPES.includes(type) || !Number.isSafeInteger(count) || count < 1
    || (inventory !== undefined && count > (inventory[type] ?? 0)))) {
    throw new RangeError('Invalid required part count');
  }
  return {
    version: 2,
    counts: Object.fromEntries(PART_TYPES.filter(type => Object.hasOwn(requirement.counts, type))
      .map(type => [type, requirement.counts[type]])),
  };
}

export function summarizeUsage(requirement, used, types) {
  const usedIds = [...used];
  if (requirement === null) return {usedIds, achieved: true};
  if (typeof requirement === 'string') {
    const requiredType = requirement === 'slope' ? 'R' : requirement;
    return {usedIds, achieved: usedIds.some(id => types.get(id) === requiredType)};
  }
  const counts = Object.fromEntries(PART_TYPES.map(type => [type, 0]));
  for (const id of usedIds) counts[types.get(id)]++;
  const missing = Object.fromEntries(Object.entries(requirement.counts)
    .filter(([type, count]) => counts[type] < count)
    .map(([type, count]) => [type, count - counts[type]]));
  return {usedIds, achieved: !Object.keys(missing).length, counts, missing};
}
