'use strict';

const {before,test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash}=require('node:crypto');

let save,repo,stageSource,designs;
const oldEpoch='a'.repeat(32),newEpoch='b'.repeat(32);
const digest=raw=>createHash('sha256').update(raw).digest('hex');
before(async()=>{
  [save,repo,stageSource]=await Promise.all([import('../src/storage/save-validator.js'),
    import('../src/storage/save-repository.js'),import('../src/data/stage-definitions.js')]);
  designs=Object.fromEntries(await Promise.all(stageSource.getStages().map(async stage=>[stage.id,{stage,identity:await stageSource.getStageIdentity(stage)}])));
});
const fixture=()=>save.createDefaultSave(oldEpoch);
const ramp={id:'r1',type:'ramp',gridX:12,gridY:10,angleDeg:30};
const movable={id:'r2',type:'ramp',gridX:6,gridY:21,angleDeg:-30};
const assess=data=>save.assessSave(JSON.stringify(data),designs);
const child=(id,run)=>test(id,async t=>{const result=await run();t.diagnostic(JSON.stringify(result??{verified:true}));});
const draft=(data,id,parts)=>{data.stages[id].draft={geometryId:designs[id].identity.geometryId,placements:parts};};
const activeBest=(id,placement)=>({...Object.fromEntries(Object.entries(designs[id].identity).filter(([key])=>key!=='geometryId')),
  usedParts:placement.length,stars:3,placements:placement});

function setup(data=fixture(),{raw=JSON.stringify(data),owner=true,behavior={}}={}){
  const bytes=new Map([[save.SAVE_KEY,raw],['other-game','sentinel']]);
  const writes=[];
  let generation=0,claimed=false,allowed=owner;
  const lock={
    current:()=>generation, isOwner:g=>claimed&&g===generation,
    release(){claimed=false;generation++;},
    async acquire(){claimed=allowed;return {mode:owner?'OWNER':'DEGRADED',generation:++generation};},
  };
  const memory={
    getItem(key){if(behavior.read)behavior.read(writes.length,key);return bytes.get(key)??null;},
    setItem(key,value){if(behavior.write)behavior.write(key,value);bytes.set(key,value);writes.push({key,value});},
  };
  const repository=repo.createSaveRepository({storage:memory,lock,designs,epoch:()=>newEpoch});
  return {repository,memory,bytes,writes,behavior};
}

child('TC-D5-002-C001',()=>{
  const data=fixture(), expected=Array.from({length:10},(_,i)=>String(i+1).padStart(2,'0'));
  assert.deepEqual(Object.keys(data.stages).sort(),expected);
  assert.deepEqual(data.settings,{muted:false,volume:.7});
  assert.equal(assess(data).status,'VALID');
  for(const variant of [d=>delete d.stages['05'],d=>{d.stages['11']=d.stages['01'];},d=>{d.stages['05']='invalid';}]){
    const bad=fixture();variant(bad);assert.equal(assess(bad).status,'RECOVERY_REQUIRED');
  }
  return {expected,settings:data.settings};
});
for(const [i,input] of [[1,'{"schemaVersion":'],[3,'{"schemaVersion":1,"schemaVersion":2}'],
  [4,'{"stages":{"01":{},"\\u0030\\u0031":{}}}'],[5,'{"settings":{"muted":true,"muted":false}}']]){
  child('TC-D5-013-C00'+i,()=>{
    const result=save.assessSave(input,designs);
    assert.equal(result.status,'RECOVERY_REQUIRED');assert.equal(result.raw,input);assert.equal(result.reason,'SYNTAX');
    return {input,result};
  });
}
child('TC-D5-014-C001',()=>{
  const input=['null','[]','{"gameId":"another-game","schemaVersion":1}'];
  const actual=input.map(raw=>save.assessSave(raw,designs).status);
  assert.deepEqual(actual,input.map(()=> 'RECOVERY_REQUIRED'));
  return {input,actual};
});
child('TC-D5-015-C001',()=>{
  const inputs=[0,2,'1'];
  const actual=inputs.map(schemaVersion=>assess({...fixture(),schemaVersion}).reason);
  assert.deepEqual(actual,['VERSION','VERSION','VERSION']);
  return {inputs,actual};
});
const invalidShapes=[{gridX:-1},{gridX:41},{gridX:1.5},{gridY:31},{type:'unknown'},{angleDeg:17},{id:'a'.repeat(33)}];
function invalidPart(change){
  const data=fixture();
  draft(data,'01',[{...ramp,...change}]);
  draft(data,'04',[movable]);
  const checked=assess(data);
  assert.equal(checked.status,'RECOVERY_REQUIRED');assert.equal(checked.data.stages['01'].draft,null);
  assert.deepEqual(checked.data.stages['04'],data.stages['04']);
  return {input:change,actual:checked.issues};
}
child('TC-D5-016-C001',()=>invalidShapes.map(invalidPart));
invalidShapes.forEach((change,i)=>child('TC-D5-016-C00'+(i+2),()=>invalidPart(change)));
child('TC-D5-017-C001',()=>{
  const shapes=[[ramp,{...ramp,id:'second',gridX:30}],[ramp,ramp],Array.from({length:14},(_,i)=>({...ramp,id:'r'+i}))];
  return shapes.map(placements=>{
    const data=fixture();draft(data,'01',placements);
    const result=assess(data);
    assert.equal(result.status,'RECOVERY_REQUIRED');assert.equal(result.data.stages['01'].draft,null);
    return {count:placements.length,issues:result.issues};
  });
});
child('TC-D5-019-C001',()=>{
  const data=fixture();
  const p=[{...ramp,id:'good1',gridX:12,gridY:9},{...ramp,id:'good2',gridX:18,gridY:11}];
  data.stages['03'].progress={cleared:true,historicalBestStars:3};
  data.stages['03'].currentBest={...activeBest('03',p),usedParts:1};
  const actual=assess(data);assert.equal(actual.data.stages['03'].currentBest,null);
  return {actual:actual.issues};
});
child('TC-D5-021-C001',()=>{
  for(const volume of [-.1,1.1,'0.7']){
    const actual=assess({...fixture(),settings:{volume,muted:true}});
    assert.deepEqual(actual.data.settings,{volume:.7,muted:true});
  }
  assert.deepEqual(assess({...fixture(),settings:{volume:.6,muted:'true'}}).data.settings,{volume:.6,muted:false});
});
child('TC-D5-020-C001',()=>{
  for(const input of [{cleared:true,historicalBestStars:99},{cleared:true}]){
    const data=fixture();data.stages['03'].progress=input;
    const actual=assess(data);
    assert.equal(actual.status,'RECOVERY_REQUIRED');
    assert.deepEqual(actual.data.stages['03'].progress,{cleared:true,historicalBestStars:null});
  }
});
child('TC-D5-018-C001',()=>{
  const data=fixture();draft(data,'01',[ramp]);draft(data,'03',[{...ramp,gridX:-1}]);
  const actual=assess(data);
  for(const id of save.STAGE_IDS.filter(id=>id!=='03'))assert.deepEqual(actual.data.stages[id],data.stages[id]);
  assert.equal(actual.data.stages['03'].draft,null);
});
for(const [i,revision] of [[3,-1],[4,9007199254740992],[5,9007199254740991]]){
  child('TC-D5-044-C00'+i,()=>{
    const actual=assess({...fixture(),revision});
    assert.equal(actual.status,'RECOVERY_REQUIRED');
    return {revision,reason:actual.reason};
  });
}
child('TC-D5-044-C006',async()=>{
  const f=setup({...fixture(),revision:12});
  await f.repository.start();
  const next=structuredClone(f.repository.read().data);
  draft(next,'01',[ramp]);
  assert(f.repository.commit(next));
  assert.equal(f.writes.length,1);
  const actual=JSON.parse(f.bytes.get(save.SAVE_KEY));
  assert.equal(actual.revision,13);assert.equal(actual.saveEpoch,oldEpoch);
  return {actual};
});
child('TC-D5-044-C007',async()=>{
  const f=setup({...fixture(),revision:Number.MAX_SAFE_INTEGER});
  await f.repository.start();
  assert.equal(f.repository.commit(f.repository.read().data),false);
  assert.equal(f.repository.read().mode,'RECOVERY_REQUIRED');
  assert.equal(f.writes.length,0);
});
for(const [i,initial,partial,expected] of [
  [8,()=>({...fixture(),revision:Number.MAX_SAFE_INTEGER}),false,[newEpoch,0]],
  [9,()=>{const d=fixture();d.revision=-1;draft(d,'01',[ramp]);return d;},true,[newEpoch,0]],
  [12,()=>{const d=fixture();d.revision=12;draft(d,'01',[ramp]);return d;},false,[oldEpoch,13]],
]){
  child('TC-D5-044-C'+String(i).padStart(3,'0'),async()=>{
    const f=setup(initial());await f.repository.start();
    const current=f.repository.read().data.stages['01'].draft;
    assert(f.repository.reset(true,partial));
    const raw=JSON.parse(f.bytes.get(save.SAVE_KEY));
    assert.deepEqual([raw.saveEpoch,raw.revision],expected);
    assert.deepEqual(raw.stages['01'].draft,partial?current:null);
    assert.equal(f.bytes.get('other-game'),'sentinel');
    return {expected,raw};
  });
}
child('TC-D5-044-C010',async()=>{
  const data=fixture();delete data.saveEpoch;
  const f=setup(data),original=f.bytes.get(save.SAVE_KEY);
  await f.repository.start();assert.equal(f.repository.reset(false,true),false);
  assert.equal(f.bytes.get(save.SAVE_KEY),original);assert.equal(f.writes.length,0);
});
child('TC-D5-044-C011',async()=>{
  const f=setup({...fixture(),saveEpoch:'invalid'});
  await f.repository.start();
  f.bytes.set(save.SAVE_KEY,'foreign replace');
  assert.equal(f.repository.reset(true,true),false);
  assert.equal(f.repository.read().status,'CONFLICT');assert.equal(f.writes.length,0);
  assert.equal(f.bytes.get(save.SAVE_KEY),'foreign replace');
});
child('TC-D5-030-C001',async()=>{
  const f=setup();await f.repository.start();
  f.bytes.set(save.SAVE_KEY,'changed despite lease');
  f.repository.notify('changed despite lease');
  assert.equal(f.repository.commit(f.repository.read().data),false);
  assert.equal(f.repository.read().status,'CONFLICT');assert.equal(f.writes.length,0);
});
child('TC-D5-033-C001',async()=>{
  const f=setup();await f.repository.start();
  const previous=f.repository.read().generation;
  f.repository.release();await f.repository.start();
  assert.equal(f.repository.commit(f.repository.read().data,previous),false);
  assert.equal(f.writes.length,0);
});
child('TC-D5-022-C001',async()=>{
  const f=setup(fixture(),{behavior:{read(){throw new Error('unavailable');}}});
  await f.repository.start();
  assert.equal(f.repository.read().status,'TEMPORARY');assert.equal(f.writes.length,0);
});
child('TC-D5-023-C001',async()=>{
  for(const err of ['QuotaExceededError','SecurityError']){
    const f=setup(fixture(),{behavior:{write(){throw Object.assign(new Error(err),{name:err});}}});
    await f.repository.start();const before=f.bytes.get(save.SAVE_KEY);
    assert.equal(f.repository.commit({...f.repository.read().data,settings:{muted:false,volume:.4}}),false);
    assert.equal(f.repository.read().status,'UNSAVED');assert.equal(f.bytes.get(save.SAVE_KEY),before);
  }
});
child('TC-D5-036-C001',async()=>{
  const {createSaveLock}=await import('../src/storage/lock-manager.js');
  for(const missing of [undefined,{request(){return Promise.reject(new Error('locks denied'));}}]){
    const lock=createSaveLock(missing);const actual=await lock.acquire();
    assert.equal(actual.mode,'DEGRADED');assert.equal(lock.isOwner(actual.generation),false);
  }
});
child('TC-D5-044-C001',async()=>{
  const f=setup();
  await f.repository.start();
  f.behavior.read=count=>{if(count>0)throw new Error('readback fault');};
  const next={...f.repository.read().data,settings:{muted:false,volume:.4}};
  assert.equal(f.repository.commit(next),false);
  assert.equal(f.repository.read().status,'UNKNOWN');
  const later={...next,settings:{muted:true,volume:.4}};
  assert.equal(f.repository.commit(later),false);assert.equal(f.writes.length,1);
  delete f.behavior.read;
  assert(f.repository.reconcile());
  assert.equal(f.repository.read().dirty,true);
  assert.equal(f.repository.read().status,'UNSAVED');
});
child('TC-D5-037-C001',()=>{
  const d=fixture();
  d.stages['01'].progress={cleared:true,historicalBestStars:3};
  d.stages['01'].currentBest={...activeBest('01',[ramp]),compatibilityId:'previous-compatible'};
  const actual=assess(d);
  assert.equal(actual.status,'VALID');
  assert.equal(actual.data.stages['01'].currentBest,null);
  assert.deepEqual(actual.data.stages['01'].previousBest,d.stages['01'].currentBest);
});
child('TC-D5-037-C002',()=>{
  const text=readFileSync(resolve(__dirname,'../../../handoffs/game-0010/06_data_design.md'),'utf8');
  const vectors=[...text.matchAll(/正規文字列（末尾改行なし）:\n```json\n([^\n]+)\n```\n期待SHA-256: `([0-9a-f]{64})`/gu)];
  assert.equal(vectors.length,3);
  for(const [,source,expected] of vectors){
    const data=JSON.parse(source);
    const backwards=Object.fromEntries(Object.entries(data).reverse());
    const canonical=JSON.stringify(stageSource.canonicalPayload(backwards));
    assert.equal(canonical,source);assert.equal(digest(canonical),expected);
  }
  const miniature=[
    ['{"ballRadiusMm":200,"domain":"game-0010/geometry/v1","stageId":"01"}','cb7a214a6389f6c4b577e302f5df5a7d4e7a4e8d8785c402da3ee0e2c3d9add7'],
    ['{"domain":"game-0010/physics/v1","engineSha":"0000000000000000000000000000000000000000000000000000000000000000","gravityMilli":9800,"profile":"PP-01"}','b3953799661936fd1a20493936e7c5f9d284e63828771d7fa38b63119df6cb2b'],
    ['{"domain":"game-0010/compatibility/v1","geometryId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","physicsRulesVersion":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","stageId":"01","star3Target":1}','b571d1263eae608b64819ccd631a8ba7871145b68405763d1ec3d5d19ab5489c'],
  ];
  for(const [input,expected] of miniature){
    const actual=JSON.stringify(stageSource.canonicalPayload(JSON.parse(input)));
    assert.equal(actual,input);assert.equal(digest(actual),expected);
  }
  return {vectors:6};
});
child('TC-D5-038-C001',()=>{
  const d=fixture();draft(d,'01',[ramp]);d.stages['01'].draft.geometryId='old-geometry';
  const actual=assess(d);
  assert.equal(actual.status,'VALID');
  assert.equal(actual.data.stages['01'].draft.geometryId,designs['01'].identity.geometryId);
  assert.deepEqual(actual.data.stages['01'].draft.placements,[ramp]);
});
child('TC-D5-039-C001',()=>{
  const d=fixture();draft(d,'04',[{...movable,gridX:13,gridY:23,angleDeg:0}]);
  d.stages['04'].draft.geometryId='old-geometry';
  const actual=assess(d);
  assert.equal(actual.status,'RECOVERY_REQUIRED');assert.equal(actual.data.stages['04'].draft,null);
});
child('TC-D5-041-C001',async()=>{
  const d=fixture();delete d.stages['03'];
  for(const id of ['04','05'])d.stages[id].progress={cleared:true,historicalBestStars:3};
  const actual=assess(d);
  const {unlockedStages}=await import('../src/domain/score-service.js');
  const stages=Object.fromEntries(Object.entries(actual.data.stages).map(([id,entry])=>[id,entry.progress]));
  assert.equal(actual.status,'RECOVERY_REQUIRED');
  assert.deepEqual(unlockedStages({stages}),['01','02','03','04','05','06']);
});

child('TC-D5-012-C001',()=>{
  const data=fixture();
  const positions=Array.from({length:13},(_,i)=>({id:('a'.repeat(30)+i).slice(0,32),type:'platform',
    gridX:i,gridY:30,angleDeg:0}));
  for(const id of save.STAGE_IDS){
    const best={compatibilityId:'p'.repeat(128),physicsRulesVersion:'r'.repeat(128),usedParts:13,stars:3,placements:positions};
    data.stages[id]={progress:{cleared:true,historicalBestStars:3},draft:{geometryId:'g'.repeat(128),placements:positions},
      currentBest:best,previousBest:best};
  }
  const raw=JSON.stringify(data);
  assert(raw.length<=65536);
  assert.deepEqual(save.parseSaveRaw(raw),data);
  assert.throws(()=>save.parseSaveRaw(raw.padEnd(65537)));
  const variants=Object.entries(designs).map(([id,s])=>{
    const layouts=require('../qa/fixtures/stages.json').layouts;
    const legitimate=stageSource.buildStageDesign(s.stage,layouts[id].baseline.map(([type,gridX,gridY,angleDeg])=>
      ({type,gridX,gridY,angleDeg})));
    assert(legitimate.ok);
    return [id,legitimate.placements];
  });
  const valid=fixture();
  for(const [id,parts] of variants)draft(valid,id,save.encodePlacements(parts));
  assert.equal(assess(valid).status,'VALID');
  return {structureStressUnits:raw.length,legalSeparateDrafts:10};
});

for(const [i,mutation,changed] of [
  [3,s=>({...s,fixed:s.fixed.map(p=>({...p,id:'id-only-renamed'}))}),[false,false,false]],
  [4,s=>({...s,name:'改題'}),[false,false,false]],
  [5,s=>({...s,inventory:{...s.inventory,R:s.inventory.R+1}}),[true,false,true]],
  [7,s=>({...s,star3Target:s.star3Target+1}),[false,false,true]],
  [10,s=>({...s,id:'03'}),[true,false,true]],
]){
  child('TC-D5-037-C'+String(i).padStart(3,'0'),async()=>{
    const stage=designs['01'].stage;
    const before=await stageSource.getStageIdentity(stage);
    const after=await stageSource.getStageIdentity(mutation(stage));
    const fields=['geometryId','physicsRulesVersion','compatibilityId'];
    const difference=fields.map(k=>before[k]!==after[k]);
    assert.deepEqual(difference,changed);
    return {before,after,changed};
  });
}

async function instantiate(id,data=fixture(),{makeExperiment,effects=[]}={}){
    const {createGameController}=await import('../src/app/controller.js');
    const f=setup(data);
    await f.repository.start();
    const identities=Object.fromEntries(Object.entries(designs).map(([k,v])=>[k,v.identity]));
    const calls=[];
    const scene=createGameController({stages:stageSource.getStages(),identities,hints:{},
      storage:f.repository,change(){},schedule:fn=>{calls.push(fn);return calls.length;},cancelFrame(){},makeExperiment,
      sound:{play(name){effects.push(name);},end(){},observe(){},begin(){},stop(){},resume(){},configure(){}}});
    assert(scene.dispatch({type:'enter'}));assert(scene.dispatch({type:'stage',id}));
    return {...f,scene,calls};
}
const expectRevision=(f,revision)=>{
  const raw=JSON.parse(f.bytes.get(save.SAVE_KEY));
  assert.equal(raw.revision,revision);
  return raw;
};

child('TC-D5-003-C001',async()=>{
  const f=await instantiate('01');
  assert(f.scene.dispatch({type:'add',id:'r1',partType:'R',gridX:12,gridY:10,angleDeg:30}));
  const raw=expectRevision(f,1);
  assert.equal(f.writes.length,1);
  assert.deepEqual(raw.stages['01'].draft.placements,[ramp]);
  return {actual:raw.stages['01'].draft,writeCount:f.writes.length};
});
child('TC-D5-004-C001',async()=>{
  const f=await instantiate('01');
  assert(f.scene.dispatch({type:'add',id:'r1',partType:'R',gridX:12,gridY:10,angleDeg:30}));
  assert(f.scene.dispatch({type:'move',id:'r1',gridX:12,gridY:11}));
  assert.equal(expectRevision(f,2).stages['01'].draft.placements[0].gridY,11);
  assert(f.scene.dispatch({type:'rotate',id:'r1',angleDeg:45}));
  assert.equal(expectRevision(f,3).stages['01'].draft.placements[0].angleDeg,45);
  assert(f.scene.dispatch({type:'delete',id:'r1'}));
  assert.deepEqual(expectRevision(f,4).stages['01'].draft.placements,[]);
  return {writes:f.writes.length};
});
child('TC-D5-006-C001',async()=>{
  const f=await instantiate('01');
  assert(f.scene.dispatch({type:'add',id:'r1',partType:'R',gridX:12,gridY:10,angleDeg:30}));
  const original=f.bytes.get(save.SAVE_KEY);
  assert.equal(f.scene.dispatch({type:'add',id:'r2',partType:'R',gridX:34,gridY:12,angleDeg:0}),false);
  assert.equal(f.scene.dispatch({type:'add',id:'r3',partType:'R',gridX:12,gridY:10,angleDeg:30}),false);
  assert.equal(f.bytes.get(save.SAVE_KEY),original);
  assert.equal(f.writes.length,1);
});
child('TC-D5-005-C001',async()=>{
  const existing=fixture();
  existing.stages['01'].progress={cleared:true,historicalBestStars:3};
  existing.stages['01'].currentBest=activeBest('01',[ramp]);
  const f=await instantiate('01',existing);
  assert(f.scene.dispatch({type:'add',id:'other',partType:'R',gridX:11,gridY:9,angleDeg:30}));
  assert(f.scene.dispatch({type:'request-load-best'}));assert(f.scene.dispatch({type:'confirm'}));
  assert.deepEqual(expectRevision(f,2).stages['01'].draft.placements,[ramp]);
  assert(f.scene.dispatch({type:'undo'}));
  assert.equal(expectRevision(f,3).stages['01'].draft.placements[0].id,'other');
});
child('TC-D5-005-C002',async()=>{
  for(const status of ['cancelled','legal','illegal']){
    const existing=fixture();
    existing.stages['01'].progress={cleared:true,historicalBestStars:3};
    const old={...activeBest('01',[status==='illegal'?{...ramp,gridX:0}:ramp]),compatibilityId:'historic-only'};
    existing.stages['01'].previousBest=old;
    const f=await instantiate('01',existing);
    assert(f.scene.dispatch({type:'request-load-best'}));
    const ok=f.scene.dispatch({type:status==='cancelled'?'cancel':'confirm'});
    assert.equal(ok,status!=='illegal');
    const actual=expectRevision(f,status==='legal'?1:0).stages['01'];
    assert.deepEqual(actual.draft?.placements??[],status==='legal'?[ramp]:[]);
    assert.deepEqual(actual.previousBest,old);assert.equal(actual.currentBest,null);
    assert.equal(f.scene.state().editor.history.length,status==='legal'?1:0);
  }
});

for(const [i,scope] of [[6,'gravity'],[8,'engine'],[9,'sweep']]){
  child('TC-D5-037-C'+String(i).padStart(3,'0'),async()=>{
    const doc=readFileSync(resolve(__dirname,'../../../handoffs/game-0010/06_data_design.md'),'utf8');
    const matched=[...doc.matchAll(/正規文字列（末尾改行なし）:\n```json\n([^\n]+)\n```/gu)].map(m=>JSON.parse(m[1]));
    const canonical=x=>digest(JSON.stringify(stageSource.canonicalPayload(x)));
    const rows=[];
    for(const selected of Object.values(designs)){
      const geometry=stageSource.geometryPayload(selected.stage),physics=stageSource.physicsPayload();
      const template={...matched[2],stageId:selected.stage.id,geometryId:canonical(geometry),physicsRulesVersion:canonical(physics),
        star3Target:selected.stage.star3Target,requiredUsage:{type:{slope:'rotated-ramp',R:'ramp',P:'platform',B:'spring',S:'seesaw'}[selected.stage.required]??'none',ruleVersion:'v1'}};
      assert.equal(canonical(template),selected.identity.compatibilityId);
      const changedGeometry=structuredClone(geometry),changedPhysics=structuredClone(physics);
      if(scope==='gravity')changedPhysics.gravity.y=-10;
      if(scope==='engine')changedPhysics.engineSha='f'.repeat(64);
      if(scope==='sweep')changedGeometry.sweepEnvelope.expandM=.066;
      const newGeometry=canonical(changedGeometry),newPhysics=canonical(changedPhysics);
      assert.equal(newGeometry!==template.geometryId,scope==='sweep');
      assert.equal(newPhysics!==template.physicsRulesVersion,scope!=='sweep');
      assert.notEqual(canonical({...template,geometryId:newGeometry,physicsRulesVersion:newPhysics}),selected.identity.compatibilityId);
      rows.push({stage:selected.stage.id,geometryChanged:scope==='sweep',physicsChanged:scope!=='sweep',compatibilityChanged:true});
    }
    return {scope,rows};
  });
}
async function unknownWrite(f){
  await f.repository.start();
  const baseline=f.bytes.get(save.SAVE_KEY);
  f.behavior.read=count=>{if(count>0)throw new Error('readback unavailable');};
  const candidate={...f.repository.read().data,settings:{volume:.4,muted:true}};
  assert.equal(f.repository.commit(candidate),false);
  assert.equal(f.repository.read().status,'UNKNOWN');
  return {baseline,candidate,written:f.bytes.get(save.SAVE_KEY)};
}
child('TC-D7-008-C001',async()=>{
  const results=[];
  for(const [kind,expected] of [['new','SAVED'],['old','UNSAVED'],['foreign','CONFLICT'],['unreadable','UNKNOWN']]){
    const f=setup();
    const original=await unknownWrite(f);
    if(kind!=='unreadable')delete f.behavior.read;
    if(kind==='old')f.bytes.set(save.SAVE_KEY,original.baseline);
    if(kind==='foreign')f.bytes.set(save.SAVE_KEY,'foreign');
    const actual=f.repository.reconcile();
    assert.equal(f.repository.read().status,expected);
    assert.equal(actual,kind==='new');
    assert.equal(f.writes.length,1);
    results.push({kind,expected,actual:f.repository.read().status});
  }
  return results;
});
for(const id of ['TC-D7-008-C003','TC-D7-008-C007'])child(id,async()=>{
  const f=setup({...fixture(),revision:12});
  await unknownWrite(f);
  const c={...f.repository.read().data,settings:{volume:.2,muted:true}};
  assert.equal(f.repository.commit(c),false);
  delete f.behavior.read;
  assert(f.repository.reconcile());
  assert.equal(expectRevision(f,13).settings.volume,.4);
  assert.equal(f.repository.read().data.settings.volume,.2);
  assert.equal(f.repository.read().status,'UNSAVED');
  if(id.endsWith('003')){
    assert(f.repository.commit(f.repository.read().data));
    assert.equal(expectRevision(f,14).settings.volume,.2);
  }
});
child('TC-D7-008-C004',async()=>{
  const f=setup();
  await unknownWrite(f);
  f.repository.release();
  delete f.behavior.read;
  const before=structuredClone(f.repository.read());
  assert.equal(f.repository.reconcile(),false);
  assert.deepEqual(f.repository.read(),before);
  assert.equal(f.writes.length,1);
});
child('TC-D7-008-C005',async()=>{
  const d=fixture();d.revision=Number.MAX_SAFE_INTEGER;draft(d,'01',[ramp]);
  const f=setup(d);await f.repository.start();
  f.behavior.read=count=>{if(count>0)throw new Error('readback unavailable');};
  assert.equal(f.repository.reset(true),false);
  assert.deepEqual(f.repository.read().data.stages['01'].draft.placements,[ramp]);
  const written=expectRevision(f,0);
  assert.equal(written.saveEpoch,newEpoch);
  delete f.behavior.read;
  assert(f.repository.reconcile());
  assert.equal(f.repository.read().data.stages['01'].draft,null);
});
child('TC-D7-008-C006',async()=>{
  const f=setup({...fixture(),schemaVersion:2});
  const before=f.bytes.get(save.SAVE_KEY);
  await f.repository.start();
  assert.equal(f.repository.commit(f.repository.read().data),false);
  assert.equal(f.repository.reset(true,true),false);
  assert.equal(f.bytes.get(save.SAVE_KEY),before);
});
child('TC-D7-009-C001',()=>{
  const data=fixture();
  data.stages['01'].progress={cleared:true,historicalBestStars:3};
  const saved=activeBest('01',[ramp]);
  data.stages['01'].currentBest=saved;
  const render=name=>{
    const variant={...designs,'01':{...designs['01'],identity:{...designs['01'].identity,compatibilityId:name}}};
    return save.assessSave(JSON.stringify(data),variant).data;
  };
  const once=render('old-revision-a');
  Object.assign(data,once);
  const second=render('old-revision-b');
  assert.deepEqual(second.stages['01'].previousBest,saved);
  assert.equal(second.stages['01'].currentBest,null);
  assert.deepEqual(second.stages['01'].progress,{cleared:true,historicalBestStars:3});
});

function run(f,expected){
  assert(f.scene.dispatch({type:'start'}));
  for(let index=0;index<=1210&&f.scene.state().screen==='RUNNING';index++)f.calls.at(-1)(index*1000/60);
  assert.equal(f.scene.state().screen,expected);
  return f.scene.state().result;
}
const addNormal=f=>f.scene.dispatch({type:'add',id:'r1',partType:'R',gridX:12,gridY:10,angleDeg:30});
child('TC-D5-008-C001',async()=>{
  const f=await instantiate('01');
  assert(addNormal(f));
  const clear=run(f,'CLEARED');
  const s=expectRevision(f,2);
  assert.equal(f.writes.length,2);
  assert.deepEqual(s.stages['01'].progress,{cleared:true,historicalBestStars:3});
  assert.deepEqual(s.stages['01'].currentBest,activeBest('01',[ramp]));
  return {actual:clear,terminalWriteCount:f.writes.length-1};
});
child('TC-D5-009-C001',async()=>{
  const cleared=fixture();
  cleared.stages['01'].progress={cleared:true,historicalBestStars:3};
  cleared.stages['01'].currentBest=activeBest('01',[ramp]);
  const f=await instantiate('01',cleared);
  const before=f.bytes.get(save.SAVE_KEY);
  const fail=run(f,'FAILED');assert.equal(fail.code,'FL-003');
  f.scene.dispatch({type:'redesign'});assert(f.scene.dispatch({type:'start'}));assert(f.scene.dispatch({type:'abort'}));
  assert.equal(f.bytes.get(save.SAVE_KEY),before);assert.equal(f.writes.length,0);
  const isolate=await instantiate('01',cleared,{makeExperiment(stage,design,options){
    return {runId:options.runId,step:()=>({tick:1,position:stage.ball,error:true}),dispose(){}};
  }});
  const initial=isolate.bytes.get(save.SAVE_KEY);
  const error=run(isolate,'ERROR');
  assert.equal(error.code,'PHYSICS_ERROR');
  assert.equal(isolate.bytes.get(save.SAVE_KEY),initial);assert.equal(isolate.writes.length,0);
  return {fail,error,errorMode:'isolated application error delivery, no physical fault claimed'};
});
child('TC-D5-040-C001',async()=>{
  const existing=fixture();
  for(const id of ['01','02','03','04','05'])existing.stages[id].progress={cleared:true,historicalBestStars:3};
  existing.stages['05'].previousBest={...activeBest('05',[{id:'spring-old',type:'spring',gridX:7,gridY:25,angleDeg:30}]),
    compatibilityId:'historic-id'};
  const f=await instantiate('05',existing);
  for(const p of [
    {id:'right',partType:'P',gridX:35,gridY:26,angleDeg:0},
    {id:'spring',partType:'B',gridX:7,gridY:25,angleDeg:30},
    {id:'ramp',partType:'R',gridX:25,gridY:12,angleDeg:15},
  ])assert(f.scene.dispatch({type:'add',...p}));
  const terminal=run(f,'CLEARED');
  const row=expectRevision(f,4).stages['05'];
  assert.equal(row.currentBest.usedParts,3);
  assert.equal(row.currentBest.stars,3);
  assert.deepEqual(row.previousBest,existing.stages['05'].previousBest);
  assert.equal(row.progress.historicalBestStars,3);
  return {terminal,best:row.currentBest};
});
child('TC-D5-042-C001',async()=>{
  const f=await instantiate('01');
  assert(addNormal(f));run(f,'CLEARED');
  assert(f.scene.dispatch({type:'redesign'}));assert(f.scene.state().previousTrajectory);
  assert(f.scene.dispatch({type:'request-reset'}));assert(f.scene.dispatch({type:'cancel'}));
  expectRevision(f,2);assert(f.scene.state().previousTrajectory);
  assert(f.scene.dispatch({type:'request-reset'}));assert(f.scene.dispatch({type:'confirm'}));
  const saved=expectRevision(f,3).stages['01'];
  assert.deepEqual(saved.draft.placements,[]);
  assert.equal(f.scene.state().editor.history.length,0);
  assert.equal(f.scene.state().previousTrajectory,null);
  assert.deepEqual(saved.progress,{cleared:true,historicalBestStars:3});
});
child('TC-D6-036-C001',async()=>{
  const effects=[];
  const f=await instantiate('01',fixture(),{effects});
  assert(addNormal(f));
  assert(f.scene.dispatch({type:'rotate',id:'r1',angleDeg:45}));
  assert.equal(f.scene.dispatch({type:'rotate',id:'r1',angleDeg:19}),false);
  assert.equal(f.scene.dispatch({type:'add',id:'r2',partType:'R',gridX:12,gridY:10,angleDeg:30}),false);
  assert.deepEqual(effects,['place','rotate']);
  return {effects};
});
child('TC-D6-033-C001',async()=>{
  const plain=await instantiate('01');
  const themed=await instantiate('01',fixture(),{effects:[]});
  assert(addNormal(plain));assert(addNormal(themed));
  assert.equal(run(plain,'CLEARED').tick,run(themed,'CLEARED').tick);
  assert.deepEqual(plain.scene.state().previousTrajectory,themed.scene.state().previousTrajectory);
});
