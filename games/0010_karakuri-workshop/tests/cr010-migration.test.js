import assert from 'node:assert/strict';
import test from 'node:test';
import {getLegacyDesigns} from '../src/data/legacy-stage-identities.js';
import {getStages, getStageIdentity} from '../src/data/stage-definitions.js';
import {createSaveRepository} from '../src/storage/save-repository.js';
import {SAVE_KEY, assessSave, createDefaultSave} from '../src/storage/save-validator.js';
import {digestSaveRaw, legacyArchiveKey} from '../src/storage/save-migration.js';

const epoch = 'b'.repeat(32);
const legacyDesigns = getLegacyDesigns();
const designs = Object.fromEntries(await Promise.all(getStages().map(async stage=>[stage.id,{stage,identity:await getStageIdentity(stage)}])));
const read = map => JSON.parse(map.get(SAVE_KEY));
function fixtures(oldRaw) {
  const map = new Map(oldRaw ? [[SAVE_KEY,oldRaw],['another.game','protected']] : [['another.game','protected']]);
  const writes=[];
  const lock={token:0,owner:true,async acquire(){this.token++;return {mode:this.owner?'OWNER':'READ_ONLY',generation:this.token};},
    current(){return this.token;},isOwner(token){return this.owner&&token===this.token;},release(){this.token++;this.owner=false;}};
  const storage={
    getItem:key=>map.get(key)??null,
    setItem(key,value){writes.push(key);map.set(key,value);},
    keys:()=>[...map.keys(), 'daily-mini-games.game-0010.v1-cr010.invalid'],
  };
  const repository=createSaveRepository({storage,lock,designs,legacyDesigns,epoch:()=>epoch});
  return {map,lock,storage,repository,writes};
}
function legacySave() {
  const save=createDefaultSave(epoch);
  save.revision=41;
  const best=(id)=>({compatibilityId:legacyDesigns[id].identity.compatibilityId,
    physicsRulesVersion:legacyDesigns[id].identity.physicsRulesVersion,usedParts:1,stars:3,
    placements:[{id:'legacy-1',type:'ramp',gridX:12,gridY:10,angleDeg:30}]});
  save.stages['01']={progress:{cleared:true,historicalBestStars:3},
    draft:{geometryId:legacyDesigns['01'].identity.geometryId,placements:best('01').placements},
    currentBest:best('01'),previousBest:best('01')};
  save.stages['03']={progress:{cleared:true,historicalBestStars:3},
    draft:{geometryId:legacyDesigns['03'].identity.geometryId,placements:[]},
    currentBest:{...best('03'),usedParts:0,placements:[]},previousBest:best('01')};
  return JSON.stringify(save,null,1)+'\n';
}
test('CR010-SAVE-01/02/03 V1 stays raw pending explicit consent; V2 preserves history and the unchanged current best',async()=>{
  const raw=legacySave();
  const {map,repository,writes}=fixtures(raw);
  await repository.start();
  assert.equal(repository.read().mode,'MIGRATION_REQUIRED');
  assert.equal(await repository.migrateV1(false),false);
  assert.equal(repository.commit(repository.read().data),false);
  assert.equal(repository.reset(true),false);
  assert.equal(map.get(SAVE_KEY),raw);
  assert.deepEqual(writes,[]);
  assert.equal(await repository.migrateV1(true),true);
  const next=read(map);
  assert.equal(next.schemaVersion,2);
  assert.equal(next.saveEpoch,epoch);
  assert.equal(next.revision,42);
  assert.deepEqual(next.stages['01'],JSON.parse(raw).stages['01']);
  assert.equal(next.stages['03'].currentBest,null);
  assert.equal(next.stages['03'].draft,null);
  assert.deepEqual(next.stages['03'].progress,{cleared:true,historicalBestStars:3});
  assert.deepEqual(next.tutorial,{curriculumVersion:1,state:'unseen',nextStep:1});
  const key=legacyArchiveKey(next.legacyV1);
  assert.equal(next.legacyV1.sourceSHA256,await digestSaveRaw(raw));
  assert.equal(map.get(key),raw);
  assert.equal((await repository.readArchive(key)).raw,raw);
  assert.deepEqual(writes,[key,SAVE_KEY]);
  assert.equal(map.get('another.game'),'protected');
});
test('CR010-SAVE-04 strict V2 rejects duplicates, incompatible stage drafts and invalid tutorial records',()=>{
  const source=createDefaultSave(epoch,2);
  assert.equal(assessSave(JSON.stringify(source),designs,{version:2}).status,'VALID');
  for(const invalid of [{state:'unseen',nextStep:2},{state:'completed',nextStep:12},
    {state:'skipped',nextStep:'3'},{state:'inProgress',nextStep:0,extra:true}]){
    const testRaw=JSON.stringify({...source,tutorial:{...source.tutorial,...invalid}});
    assert.equal(assessSave(testRaw,designs,{version:2}).status,'RECOVERY_REQUIRED');
  }
  const duplicate=JSON.stringify(source).replace('"nextStep":1','"nextStep":1,"nextStep":1');
  assert.equal(assessSave(duplicate,designs,{version:2}).status,'RECOVERY_REQUIRED');
  const forged=JSON.stringify({...createDefaultSave(epoch),schemaVersion:2});
  assert.equal(assessSave(forged,designs,{version:2}).status,'RECOVERY_REQUIRED');
  source.stages['03'].draft={geometryId:legacyDesigns['03'].identity.geometryId,placements:[]};
  assert.equal(assessSave(JSON.stringify(source),designs,{version:2}).status,'RECOVERY_REQUIRED');
});
test('CR010-SAVE-05 quota, invalid readback and archive collision preserve the V1 main value',async()=>{
  const raw=legacySave();
  for(const type of ['quota','readback','archiveCollision']){
    const {map,repository,storage,writes}=fixtures(raw);
    await repository.start();
    const key=legacyArchiveKey({sourceEpoch:epoch,sourceRevision:41,sourceSHA256:await digestSaveRaw(raw)});
    if(type==='archiveCollision')map.set(key,'different');
    if(type==='quota')storage.setItem=()=>{throw new Error('quota');};
    if(type==='readback'){
      const before=storage.getItem;
      storage.getItem=id=>id===key&&map.has(id)?null:before(id);
    }
    assert.equal(await repository.migrateV1(true),false,type);
    assert.equal(map.get(SAVE_KEY),raw,type);
    assert(!writes.includes(SAVE_KEY),type);
  }
});
test('CR010-SAVE-06 same owner retries a retained archive; lock release blocks a stale async migration',async()=>{
  const raw=legacySave();
  const {map,repository,storage,lock,writes}=fixtures(raw);
  await repository.start();
  const update=repository.migrateV1(true);
  repository.release();
  assert.equal(await update,false);
  assert.deepEqual(writes,[]);
  lock.owner=true;
  await repository.start();
  const before=storage.setItem;
  storage.setItem=(key,value)=>{if(key===SAVE_KEY)throw new Error('interruption');else before(key,value);};
  assert.equal(await repository.migrateV1(true),false);
  assert.equal(map.get(SAVE_KEY),raw);
  const backup=repository.archiveKeys();
  assert.equal(backup.length,1);
  storage.setItem=before;
  assert.equal(await repository.migrateV1(true),true);
  assert.deepEqual(writes,[backup[0],SAVE_KEY]);
});
test('CR010-SAVE-07 tutorial commits exactly tutorial and revision; normal edits preserve agreed tutorial',async()=>{
  const {map,repository}=fixtures();
  await repository.start();
  const before=read(map);
  const generation=repository.read().generation;
  const tutorial={curriculumVersion:1,state:'inProgress',nextStep:2};
  assert.equal(repository.commitTutorial(tutorial,generation-1),false);
  assert.equal(repository.commitTutorial(tutorial,generation),true);
  const after=read(map);
  assert.deepEqual(after,{...before,tutorial,revision:before.revision+1});
  assert.equal(repository.commit({...after,settings:{...after.settings,volume:.4},
    tutorial:{curriculumVersion:1,state:'completed',nextStep:13}}),true);
  assert.deepEqual(read(map).tutorial,tutorial);
});
test('CR010-SAVE-08 failed normal writes and saved tutorial state cannot piggyback',async()=>{
  const {map,repository,storage}=fixtures();
  await repository.start();
  const before=read(map);
  const write=storage.setItem;
  storage.setItem=()=>{throw new Error('quota');};
  assert.equal(repository.commit({...before,settings:{...before.settings,volume:.2}}),false);
  const lesson={curriculumVersion:1,state:'inProgress',nextStep:3};
  storage.setItem=write;
  assert.equal(repository.commitTutorial(lesson),false);
  assert.deepEqual(read(map),before);
  assert.equal(repository.commit(repository.read().data),true);
  assert.equal(repository.commitTutorial(lesson),true);
  assert.equal(read(map).settings.volume,.2);
});
test('CR010-SAVE-09 archive readback uses strict keys and never resets other game or archive',async()=>{
  const raw=legacySave();
  const {map,repository}=fixtures(raw);
  await repository.start();
  assert.equal(await repository.migrateV1(true),true);
  const [key]=repository.archiveKeys();
  const savedEpoch=read(map).saveEpoch;
  assert.equal(repository.reset(true),true);
  assert.equal(read(map).saveEpoch,savedEpoch);
  assert.equal(map.get(key),raw);
  assert.equal(map.get('another.game'),'protected');
  assert.deepEqual(repository.archiveKeys(),[key]);
  map.set(key,raw+' ');
  assert.equal(await repository.readArchive(key),null);
});

test('CR010-SAVE V1 revision boundary retains its original and history without permitting reset',async()=>{
  for(const revision of [Number.MAX_SAFE_INTEGER-2,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER]){
    const original=JSON.stringify({...JSON.parse(legacySave()),revision})+'\n';
    const {repository,map}=fixtures(original);
    await repository.start();
    if(revision===Number.MAX_SAFE_INTEGER-2){
      assert.equal(await repository.migrateV1(true),true);
      assert.equal(read(map).revision,revision+1);
    }else{
      assert.equal(repository.read().recoveryReason,'REVISION');
      assert.equal(repository.read().data.stages['03'].progress.cleared,true);
      assert.equal(repository.blockedV1Raw(),original);
      assert.equal(repository.reset(true,true),false);
      assert.equal(await repository.migrateV1(true),false);
      assert.equal(map.get(SAVE_KEY),original);
    }
  }
});

test('CR010-SAVE tutorial graduation cannot be overwritten by a delayed skip',async()=>{
  const {repository,map}=fixtures();
  await repository.start();
  assert(repository.commitTutorial({curriculumVersion:1,state:'completed',nextStep:13}));
  const completed=map.get(SAVE_KEY);
  assert.equal(repository.commitTutorial({curriculumVersion:1,state:'skipped',nextStep:12}),false);
  assert.equal(map.get(SAVE_KEY),completed);
});
