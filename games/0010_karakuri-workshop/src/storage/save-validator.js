import {getPartDefinition} from '../data/part-definitions.js';
import {validatePlacement} from '../domain/placement-validator.js';
import {starsForResult} from '../domain/score-service.js';

export const SAVE_KEY = 'daily-mini-games.game-0010.save';
export const LOCK_NAME = 'daily-mini-games.game-0010.save-lock';
export const MAX_SAVE_LENGTH = 65536;
export const STAGE_IDS = Object.freeze(Array.from({length: 10}, (_, i) => String(i + 1).padStart(2, '0')));
const tags = {R: 'ramp', P: 'platform', B: 'spring', S: 'seesaw'};
const types = Object.fromEntries(Object.entries(tags).map(([type, name]) => [name, type]));
const idFormat = /^[A-Za-z0-9_-]{1,32}$/u;
const versionFormat = /^[A-Za-z0-9._:-]{1,128}$/u;
const epochFormat = /^[0-9a-f]{32}$/u;
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value, from, to) => Number.isSafeInteger(value) && from <= value && value <= to;
const validVersion = value => typeof value === 'string' && versionFormat.test(value);

export function createSaveEpoch(random = globalThis.crypto) {
  return Array.from(random.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
}

const emptyRecord = () => ({progress: {cleared: false, historicalBestStars: 0}, draft: null, currentBest: null, previousBest: null});
export function createDefaultSave(saveEpoch) {
  if (typeof saveEpoch !== 'string' || !epochFormat.test(saveEpoch)) throw new TypeError('Invalid save epoch.');
  return {gameId: 'game-0010', schemaVersion: 1, revision: 0, saveEpoch,
    stages: Object.fromEntries(STAGE_IDS.map(id => [id, emptyRecord()])), settings: {muted: false, volume: .7}};
}

export function parseSaveRaw(raw) {
  if (typeof raw !== 'string' || !raw.length || raw.length > MAX_SAVE_LENGTH) throw new SyntaxError('Invalid save length.');
  const parsed = JSON.parse(raw);
  const tokens = /"(?:[^"\\]|\\.)*"|[\[\]{},:]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/gu;
  const stack = [];
  for (const match of raw.matchAll(tokens)) {
    const token = match[0];
    const parent = stack.at(-1);
    if (token.startsWith('"') && parent?.expectKey) {
      const key = JSON.parse(token);
      if (parent.keys.has(key)) throw new SyntaxError('Duplicate save property.');
      parent.keys.add(key);
      parent.expectKey = false;
    }
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? {keys: new Set(), expectKey: true} : {});
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && parent?.keys) parent.expectKey = true;
  }
  return parsed;
}

export function encodePlacements(parts) {
  return parts.map(({id, type, gridX, gridY, angleDeg}) => ({id, type: tags[type], gridX, gridY, angleDeg}));
}
export function decodePlacements(parts) {
  return parts.map(p => ({...p, type: types[p.type]}));
}
function placementList(placements) {
  if (!Array.isArray(placements) || placements.length > 13) return false;
  const ids = new Set();
  for (const p of placements) {
    if (!keysAre(p, ['id','type','gridX','gridY','angleDeg']) || typeof p.id !== 'string' || !idFormat.test(p.id)
      || !integer(p.gridX, 0, 40) || !integer(p.gridY, 0, 30) || !Object.hasOwn(types, p.type)
      || !getPartDefinition(types[p.type]).angles.includes(p.angleDeg) || ids.has(p.id)) return false;
    ids.add(p.id);
  }
  return true;
}
function legal(stage, encoded) {
  const prior = [];
  for (const p of decodePlacements(encoded)) {
    if (stage.fixed.some(f => f.id === p.id) || !validatePlacement(stage, prior, p).ok) return false;
    prior.push(p);
  }
  return true;
}
const validDraft = p => p === null || keysAre(p,['geometryId','placements']) && validVersion(p.geometryId) && placementList(p.placements);
const validBest = p => p === null || keysAre(p,['compatibilityId','physicsRulesVersion','usedParts','stars','placements'])
  && validVersion(p.compatibilityId) && validVersion(p.physicsRulesVersion)
  && integer(p.stars,1,3) && integer(p.usedParts,0,13) && placementList(p.placements) && p.usedParts === p.placements.length;
const validSettings = s => keysAre(s,['muted','volume']) && typeof s.muted === 'boolean'
  && Number.isFinite(s.volume) && s.volume >= 0 && s.volume <= 1;
const validProgress = p => keysAre(p,['cleared','historicalBestStars']) && typeof p.cleared === 'boolean'
  && (p.cleared ? p.historicalBestStars === null || integer(p.historicalBestStars,1,3) : p.historicalBestStars === 0);

export function assessSave(raw, designs) {
  if (raw === null) return {status:'NEW'};
  let source;
  try { source=parseSaveRaw(raw); } catch { return {status:'RECOVERY_REQUIRED', raw, reason:'SYNTAX'}; }
  if (!source || source.gameId !== 'game-0010' || source.schemaVersion !== 1) {
    return {status:'RECOVERY_REQUIRED',raw,reason:'VERSION'};
  }
  const validRoot = keysAre(source,['gameId','schemaVersion','revision','saveEpoch','stages','settings'])
    && integer(source.revision,0,Number.MAX_SAFE_INTEGER) && typeof source.saveEpoch==='string' && epochFormat.test(source.saveEpoch)
    && keysAre(source.stages,STAGE_IDS) && validSettings(source.settings);
  const issues=[];
  const data={gameId:'game-0010',schemaVersion:1,revision:source.revision,saveEpoch:source.saveEpoch,
    stages:{},settings:validSettings(source.settings)?source.settings:{muted:false,volume:.7}};
  for(const id of STAGE_IDS){
    const row=source.stages?.[id];
    const {stage,identity}=designs[id];
    const complete=keysAre(row,['progress','draft','currentBest','previousBest']);
    const cleaned=emptyRecord();
    if(validProgress(row?.progress))cleaned.progress=row.progress;
    else issues.push(id+':progress');
    if(validDraft(row?.draft)){
      if(row.draft && legal(stage,row.draft.placements))cleaned.draft={...row.draft,geometryId:identity.geometryId};
      else if(row.draft)issues.push(id+':draft-geometry');
    }else issues.push(id+':draft');
    if(validBest(row?.previousBest))cleaned.previousBest=row.previousBest;
    else issues.push(id+':archived-best');
    if(!validBest(row?.currentBest))issues.push(id+':current-best');
    else if(row.currentBest){
      const best=row.currentBest;
      const current=best.compatibilityId===identity.compatibilityId && best.physicsRulesVersion===identity.physicsRulesVersion;
      if(!cleaned.progress.cleared || cleaned.progress.historicalBestStars!==null && best.stars>cleaned.progress.historicalBestStars){
        issues.push(id+':best-progress');
      }else if(!current){
        cleaned.previousBest=best;
      }else if(!legal(stage,best.placements)||best.stars!==starsForResult('CLEARED',best.usedParts,stage.star3Target)){
        issues.push(id+':best-geometry');
      }else cleaned.currentBest=best;
    }
    if(!complete)issues.push(id+':shape');
    data.stages[id]=cleaned;
  }
  return {status:!validRoot||issues.length||source.revision===Number.MAX_SAFE_INTEGER?'RECOVERY_REQUIRED':'VALID',
    data,raw,issues,reason:!validRoot?'SHAPE':source.revision===Number.MAX_SAFE_INTEGER?'REVISION':null};
}
