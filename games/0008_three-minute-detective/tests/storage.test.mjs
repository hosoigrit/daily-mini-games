import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, emptyProgress, sanitizeProgress, loadProgress, saveProgress, addClear } from '../storage.mjs';
const fakeStorage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};
test('empty progress and corrupted data handling',()=>{
  assert.deepEqual(sanitizeProgress(null),emptyProgress());
  assert.deepEqual(sanitizeProgress([]),emptyProgress());
  assert.deepEqual(sanitizeProgress('evil'),emptyProgress());
  assert.deepEqual(loadProgress({getItem:()=>'{INVALID_JSON'}),emptyProgress());
  assert.deepEqual(loadProgress({getItem:()=>{throw new Error('blocked');}}),emptyProgress());
});
test('storage rejects untrusted keys, bad scores, repeated solved ids',()=>{
  const x=sanitizeProgress({solved:['gem-a','gem-a','evil',88,'gem-b'],best:{'gem-a':{score:900,elapsed:30,stars:3},evil:{score:900,elapsed:30,stars:3},'gem-b':{score:-10,elapsed:20,stars:3}},attempted:4});
  assert.deepEqual(x.solved,['gem-a','gem-b']);
  assert.deepEqual(Object.keys(x.best),['gem-a']);
  assert.equal(x.attempted,4);
});
test('solved and best score retained and first clear never overwritten',()=>{
  let p=addClear(emptyProgress(),'gem-a',{score:600,elapsed:140,stars:1});
  p=addClear(p,'gem-a',{score:980,elapsed:60,stars:3});
  assert.equal(p.firstClear['gem-a'].score,600);
  assert.equal(p.best['gem-a'].score,980);
  assert.equal(p.solved.length,1);
  assert.equal(p.attempted,2);
});
test('storage roundtrip',()=>{
  const store=fakeStorage();
  const p=addClear(emptyProgress(),'gem-b',{score:920,elapsed:155,stars:2});
  assert.equal(saveProgress(store,p),true);
  assert.ok(store.map.has(STORAGE_KEY));
  assert.deepEqual(loadProgress(store),p);
});
test('safe when storage is unavailable',()=>{
  assert.equal(saveProgress({setItem:()=>{throw new Error('denied');}},emptyProgress()),false);
});
test('unknown variant cannot be marked solved',()=>assert.throws(()=>addClear(emptyProgress(),'unknown',{score:800,elapsed:10,stars:2})));

test('stored stars are always derived from score, not corrupt or forged input',()=>{
  const raw=sanitizeProgress({solved:['gem-a','man-a'],firstClear:{'gem-a':{score:960,elapsed:45,stars:1},'man-a':{score:500,elapsed:99,stars:3}},best:{'gem-a':{score:960,elapsed:45,stars:2}}});
  assert.equal(raw.firstClear['gem-a'].stars,3);
  assert.equal(raw.firstClear['man-a'].stars,1);
  assert.equal(raw.best['gem-a'].stars,3);
});
test('new clear normalizes score and stars and rejects impossible records',()=>{
  const p=addClear(emptyProgress(),'gem-a',{score:930,elapsed:45,stars:3});
  assert.equal(p.firstClear['gem-a'].stars,2);
  assert.equal(p.firstClear['gem-a'].score,930);
  for(const bad of [null,{score:NaN,elapsed:2},{score:Infinity,elapsed:0},{score:900,elapsed:-1}]){
    assert.throws(()=>addClear(emptyProgress(),'gem-a',bad),RangeError);
  }
});
