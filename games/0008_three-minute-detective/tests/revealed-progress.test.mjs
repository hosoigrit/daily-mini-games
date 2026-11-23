import test from 'node:test';
import assert from 'node:assert/strict';
import {VARIANTS} from '../case-data.mjs';
import {chooseVariant} from '../engine.mjs';
import {STORAGE_KEY,emptyProgress,sanitizeProgress,loadProgress,saveProgress,addClear,markRevealed} from '../storage.mjs';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const clear={score:900,elapsed:120};

test('IR-01 reveal, reload, replay of same truth cannot earn first unaided clear',()=>{
  const store=memory(); let progress=markRevealed(emptyProgress(),'gem-a');
  assert.deepEqual(progress.revealed,['gem-a']);
  assert.equal(saveProgress(store,progress),true);
  progress=loadProgress(store);
  assert.deepEqual(progress.revealed,['gem-a']);
  progress=addClear(progress,'gem-a',clear);
  assert.deepEqual(progress.solved,[]);
  assert.equal(progress.firstClear['gem-a'],undefined);
  assert.equal(progress.best['gem-a'],undefined);
  assert.equal(progress.attempted,0);
});
test('IR-01 revealing gem-a does not block gem-b unaided progress',()=>{
  let progress=markRevealed(emptyProgress(),'gem-a');
  progress=addClear(progress,'gem-b',clear);
  assert.deepEqual(progress.solved,['gem-b']);
  assert.ok(progress.revealed.includes('gem-a'));
  assert.deepEqual(progress.firstClear['gem-b'],{score:900,elapsed:120,stars:2});
});
test('IR-01 old progress auto-migrates missing revealed field',()=>{
  const legacy={solved:['gem-b'],firstClear:{'gem-b':{score:880,elapsed:59}},best:{'gem-b':{score:900,elapsed:55}},attempted:2};
  assert.deepEqual(sanitizeProgress(legacy).revealed,[]);
  assert.deepEqual(sanitizeProgress(legacy).solved,['gem-b']);
  assert.equal(sanitizeProgress(legacy).firstClear['gem-b'].score,880);
});
test('IR-01 sanitizer prevents forged or duplicated revealed IDs',()=>{
  const p=sanitizeProgress({solved:['gem-a'],revealed:['gem-a','gem-b','gem-b','evil',17],attempted:4});
  assert.deepEqual(p.revealed,['gem-b']);
  assert.deepEqual(p.solved,['gem-a']);
});
test('IR-01 persistent store unavailable: session still knows spoiler',()=>{
  let p=markRevealed(emptyProgress(),'gem-a');
  assert.equal(saveProgress({setItem(){throw new Error('denied')}},p),false);
  p=addClear(p,'gem-a',clear);
  assert.deepEqual(p.solved,[]);
  assert.deepEqual(p.revealed,['gem-a']);
});
test('IR-01 already earned unaided clear remains valid after reveal',()=>{
  let p=addClear(emptyProgress(),'gem-a',clear);
  p=markRevealed(p,'gem-a');
  assert.deepEqual(p.revealed,[]);
  assert.deepEqual(p.solved,['gem-a']);
  p=addClear(p,'gem-a',{score:950,elapsed:60});
  assert.equal(p.best['gem-a'].score,950);
});
test('IR-01 reveal unknown truth is rejected',()=>assert.throws(()=>markRevealed(emptyProgress(),'unknown')));
test('IR-01 unexperienced variants selected ahead of revealed and solved',()=>{
  const c=VARIANTS.filter(v=>v.caseId==='blue-gem');
  const experience=['gem-a','gem-b'];
  assert.equal(chooseVariant(experience,()=>0,'blue-gem').id,'gem-c');
  assert.equal(chooseVariant(experience,()=>0.999,'blue-gem').id,'gem-c');
});
