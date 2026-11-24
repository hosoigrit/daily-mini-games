const STAGE_FIELDS = [
  'stageId', 'group', 'order', 'heroMaxHp', 'enemyMaxHp', 'hand',
  'enemyActions', 'passives', 'rating', 'unlockAfter',
];

const ordered = value => Array.isArray(value) ? value.map(ordered) :
  value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]))
    : value;

const rulesOnly = catalog => Object.fromEntries(Object.entries(catalog).map(([id, entry]) => [
  id, Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'name' && key !== 'description')),
]));

export function canonicalRuleset(manifest) {
  const stages = [...manifest.stages].sort((a, b) => a.stageId < b.stageId ? -1 : Number(a.stageId !== b.stageId));
  return JSON.stringify(ordered({
    cardCatalog: rulesOnly(manifest.cardCatalog),
    combatRules: manifest.combatRules,
    enemyActionCatalog: rulesOnly(manifest.enemyActionCatalog),
    passiveCatalog: rulesOnly(manifest.passiveCatalog),
    progression: manifest.progression,
    stages: stages.map(stage => Object.fromEntries(STAGE_FIELDS.map(field => [field, stage[field]]))),
  }));
}

export async function fingerprintRuleset(canonical, subtle = globalThis.crypto.subtle) {
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Share the registry across stores whose rule definitions must be compared.
export function createRulesetRegistry(digest = fingerprintRuleset) {
  const definitions = new Map();
  const collisions = new Set();
  return {
    async register(canonical) {
      const fingerprint = await digest(canonical);
      if (definitions.has(fingerprint) && definitions.get(fingerprint) !== canonical) {
        collisions.add(fingerprint);
      }
      definitions.set(fingerprint, canonical);
      return fingerprint;
    },
    hasCollision: fingerprint => collisions.has(fingerprint),
  };
}
