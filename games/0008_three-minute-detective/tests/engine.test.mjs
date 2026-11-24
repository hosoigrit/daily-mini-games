import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, CASES, suspectsFor } from '../case-data.mjs';
import { chooseVariant, legalSelection, provenFacts, evaluateProof, calculateScore, starsForScore, validateCatalog, MAX_EVIDENCE } from '../engine.mjs';
const [a,b,c]=CASES[0].variants;
const cardIds=v=>v.evidence.map(e=>e.id);
function subsets(array,max=MAX_EVIDENCE){const r=[];const step=(start,p)=>{if(p.length>=2)r.push(p);if(p.length===max)return;for(let i=start;i<array.length;i++)step(i+1,[...p,array[i]]);};step(0,[]);return r;}

test('catalog integrity',()=>assert.deepEqual(validateCatalog(),[]));
test('four cases, twelve variants, distinct culprit and method in every case',()=>{
  assert.equal(CASES.length,4);assert.equal(VARIANTS.length,12);
  for(const c of CASES){assert.equal(c.variants.length,3);assert.equal(new Set(c.variants.map(v=>v.culprit)).size,3);assert.equal(new Set(c.variants.map(v=>v.method)).size,3);}
  for(const v of VARIANTS){assert.equal(v.hints.length,2);assert.equal(v.statements.length,3);}
});
for(const v of VARIANTS){
  test(`${v.id}: valid proof exists and every alternative suspect fails`,()=>{
    const combos=subsets(cardIds(v));
    const correct=combos.filter(ids=>evaluateProof(v,v.culprit,ids).success);
    assert.ok(correct.length>0);
    for(const suspect of suspectsFor(v).filter(s=>s.id!==v.culprit)){
      assert.equal(combos.filter(ids=>evaluateProof(v,suspect.id,ids).success).length,0);
    }
  });
  test(`${v.id}: proof independent of evidence order`,()=>{
    const combo=subsets(cardIds(v)).find(ids=>evaluateProof(v,v.culprit,ids).success);
    assert.ok(combo);
    assert.deepEqual(evaluateProof(v,v.culprit,combo),evaluateProof(v,v.culprit,[...combo].reverse()));
  });
  test(`${v.id}: missing each required fact does not solve`,()=>{
    for(const fact of v.requiredFacts){
      const available=v.evidence.filter(e=>!e.facts.includes(fact)).map(e=>e.id);
      for(const combo of subsets(available))assert.equal(evaluateProof(v,v.culprit,combo).success,false);
    }
  });
  test(`${v.id}: no invalid evidence or duplicate accepted`,()=>{
    const ids=cardIds(v);
    for(const invalid of [[ids[0],ids[0]],['BAD',ids[0]],[ids[0]],[...ids,'INVALID'],[]]){
      assert.equal(legalSelection(v,invalid),false);
      assert.equal(evaluateProof(v,v.culprit,invalid).status,'invalid-input');
    }
  });
  test(`${v.id}: corroborating evidence does not invalidate correct proof`,()=>{
    const good=subsets(cardIds(v)).find(ids=>evaluateProof(v,v.culprit,ids).success);
    for(const id of cardIds(v).filter(x=>!good.includes(x))){
      if(good.length>=MAX_EVIDENCE)break;
      assert.equal(evaluateProof(v,v.culprit,[...good,id]).success,true);
    }
  });
  test(`${v.id}: neutral lack-of-proof result for incomplete culprit`,()=>{
    assert.equal(evaluateProof(v,v.culprit,cardIds(v).slice(-2)).success,false);
  });
}
test('A: photo alternative to entry log accepted',()=>{
  assert.equal(evaluateProof(a,'ren',['A01','A02','A03']).success,true);
  assert.equal(evaluateProof(a,'ren',['A01','A02','A04']).success,true);
  assert.equal(evaluateProof(a,'ren',['A01','A02','A05']).success,false);
});
test('B: identity alternative supported',()=>{
  assert.equal(evaluateProof(b,'aoi',['B01','B02','B03']).success,true);
  assert.equal(evaluateProof(b,'aoi',['B01','B02','B04']).success,true);
});
test('C: actual substitution window requires four facts',()=>{
  assert.equal(evaluateProof(c,'sora',['C01','C02','C03','C04']).success,true);
  assert.equal(evaluateProof(c,'sora',['C01','C02','C03','C05']).success,true);
  assert.equal(evaluateProof(c,'sora',['C02','C03','C04','C06']).success,false);
});
test('selection requires 2-4 unique cards',()=>{
  assert.equal(legalSelection(a,['A01','A02']),true);
  assert.equal(legalSelection(a,['A01','A02','A03','A04','A05']),false);
  assert.equal(legalSelection(a,['A01',null]),false);
});
test('facts union handles alternative cards',()=>assert.deepEqual([...provenFacts(a,['A01','A02','A04'])].sort(),['actor','opening','time']));
test('chooseVariant prioritizes unseen and handles completed catalog',()=>{
  assert.equal(chooseVariant([],()=>0).id,'gem-a');
  assert.equal(chooseVariant(['gem-a'],()=>0).id,'gem-b');
  assert.equal(chooseVariant(['gem-a','gem-b'],()=>0.95).id,'gem-c');
  assert.equal(chooseVariant(['gem-a','gem-b','gem-c'],()=>0.9).id,'gem-c');
  assert.equal(chooseVariant(['gem-c','invalid'],()=>0).id,'gem-a');
  assert.equal(chooseVariant([],()=>Number.NaN).id,'gem-a');
});
test('score and stars boundary conditions',()=>{
  assert.equal(calculateScore(),1000);
  assert.equal(calculateScore({insufficient:1,wrongPerson:1,hints:1}),540);
  assert.equal(calculateScore({insufficient:100}),0);
  for(const n of [-1,1.5,NaN])assert.throws(()=>calculateScore({hints:n}),RangeError);
  assert.deepEqual([0,699,700,949,950,1000].map(starsForScore),[1,1,2,2,3,3]);
});

test('each case shuffles only within itself and prioritizes its three unseen truths',()=>{
 for(const c of CASES){
  const [v1,v2,v3]=c.variants;
  assert.equal(chooseVariant([],()=>0,c.id).id,v1.id);
  assert.equal(chooseVariant([v1.id],()=>0,c.id).id,v2.id);
  assert.equal(chooseVariant([v1.id,v2.id],()=>0.99,c.id).id,v3.id);
  assert.equal(chooseVariant([v1.id,v2.id,v3.id],()=>0,c.id).id,v1.id);
 }
 assert.throws(()=>chooseVariant([],()=>0,'nonexistent'),RangeError);
});
test('all culprit aliases remain case-local and cross-case evidence is rejected',()=>{
 for(const c of CASES){
   for(const v of c.variants){
     const own=v.evidence.filter(e=>e.facts.length).slice(0,2).map(e=>e.id);
     for(const other of CASES.filter(x=>x.id!==c.id)){
       assert.equal(evaluateProof(v,other.suspects[0].id,own).success,false);
       assert.equal(legalSelection(v,[own[0],other.variants[0].evidence[0].id]),false);
     }
   }
 }
});
