import {STAGE_IDS, assessSave, parseSaveRaw} from './save-validator.js';

const archivePrefix = 'daily-mini-games.game-0010.v1-cr010.';
const archivePattern = /^([0-9a-f]{32})\.(0|[1-9]\d*)\.([0-9a-f]{64})$/u;

export function legacyArchiveKey({sourceEpoch, sourceRevision, sourceSHA256}) {
  return `${archivePrefix}${sourceEpoch}.${sourceRevision}.${sourceSHA256}`;
}

export function legacyArchiveReference(key) {
  if (typeof key !== 'string' || !key.startsWith(archivePrefix)) return null;
  const match = archivePattern.exec(key.slice(archivePrefix.length));
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  return {sourceEpoch: match[1], sourceRevision: Number(match[2]), sourceSHA256: match[3]};
}

export async function digestSaveRaw(raw) {
  const utf8 = new TextEncoder().encode(raw);
  const bytes = await crypto.subtle.digest('SHA-256', utf8);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readLegacyArchive(storage, key, legacyDesigns) {
  const reference = legacyArchiveReference(key);
  if (!reference) return null;
  try {
    const raw = storage.getItem(key);
    if (assessSave(raw, legacyDesigns).status !== 'VALID') return null;
    const source = parseSaveRaw(raw);
    if (source.saveEpoch !== reference.sourceEpoch || source.revision !== reference.sourceRevision
      || await digestSaveRaw(raw) !== reference.sourceSHA256 || storage.getItem(key) !== raw) return null;
    return {key, reference, raw};
  } catch {
    return null;
  }
}

export function migrationPreview(source, validated, designs, legacyDesigns, base) {
  return {
    ...base, saveEpoch: source.saveEpoch, revision: source.revision, settings: source.settings,
    stages: Object.fromEntries(STAGE_IDS.map(id => {
      const unchanged = id === '01' || id === '02';
      const original = source.stages[id];
      const checked = validated.stages[id];
      const current = designs[id].identity;
      const prior = legacyDesigns[id].identity;
      const previousBest = original.previousBest;
      if (unchanged && (current.compatibilityId !== prior.compatibilityId
        || current.physicsRulesVersion !== prior.physicsRulesVersion || current.geometryId !== prior.geometryId)) {
        throw new Error(`Legacy compatibility changed for stage ${id}.`);
      }
      return [id, {
        progress: original.progress,
        draft: unchanged ? checked.draft : null,
        currentBest: unchanged ? checked.currentBest : null,
        previousBest,
      }];
    })),
  };
}
