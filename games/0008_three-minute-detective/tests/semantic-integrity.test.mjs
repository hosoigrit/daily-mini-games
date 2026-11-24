import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,VARIANTS} from '../case-data.mjs';
import {EVIDENCE_PROPOSITIONS} from '../evidence-propositions.mjs';
import {evaluateProof,validateCatalog,validateProofContract,validateVariantNarrative,validateCaseNarrative,deriveProofActor} from '../engine.mjs';
const gem=VARIANTS.find(v=>v.id==='gem-a');
const good=['A01','A02','A03'];
const change=(v,id,fn)=>({...v,evidence:v.evidence.map(e=>e.id===id?fn(e):e)});
const reject=(v)=>{
  assert.ok(validateProofContract(v).length>0,v.id);
  assert.equal(evaluateProof(v,v.culprit,good).success,false);
};
test('IR-02: all 12 variants have approved words and affirmative exclusive structured actor claims',()=>{
  assert.deepEqual(validateCatalog(),[]);
  for(const v of VARIANTS){
    assert.deepEqual(validateVariantNarrative(v),[],v.id);
    const facts=v.evidence.filter(e=>e.facts.length);
    assert.equal(facts.length,Object.keys(EVIDENCE_PROPOSITIONS[v.id]).length);
    for(const e of facts){
      const claim=EVIDENCE_PROPOSITIONS[v.id][e.id];
      assert.equal(claim.fact,e.facts[0]);
      assert.equal(claim.polarity,'affirmed');
      if(claim.fact==='actor'){assert.equal(claim.exclusive,true);assert.equal(claim.actor,v.culprit);}
    }
  }
});
test('IR-02: negated witness sentence retaining correct name & timestamp is rejected',()=>{
  const bad=change(gem,'A03',e=>({...e,body:'14:11、レンは展示室に入っておらず、事件とは無関係だった。'}));
  reject(bad);
  assert.match(validateProofContract(bad).join('|'),/unreviewed evidence A03/);
});
test('IR-02: adding a different person as possible actor in a proof sentence is rejected',()=>{
  const bad=change(gem,'A03',e=>({...e,body:e.body+' ただしアオイも内部にいた。'}));reject(bad);
});
test('IR-02: changing opportunity to an alternative route is rejected',()=>{
  const bad=change(gem,'A02',e=>({...e,body:e.body+' 別の隠し扉から入ることもできる。'}));reject(bad);
});
test('IR-02: modified timestamp in alternative actor evidence is rejected',()=>{
  const bad=change(gem,'A04',e=>({...e,body:e.body.replaceAll('14:11','14:12')}));reject(bad);
});
test('IR-02: replacing premise with untrusted records is rejected',()=>{
  const bad={...gem,premise:gem.premise+' ただし記録は改ざんできる。'};reject(bad);
});
test('IR-02: tampering with case rules fails catalog narrative audit',()=>{
  const c=CASES.find(c=>c.id==='blue-gem');
  assert.ok(validateCaseNarrative({...c,rules:[...c.rules,'事務室から宝石を遠隔操作で取れる。']}).some(e=>e.includes('unreviewed case rules')));
});
test('IR-02: facts are rejected if actor proposition annotation changes even when text is unchanged',()=>{
  const bad=change(gem,'A03',e=>({...e,facts:['opening']}));reject(bad);
});
test('IR-02: an unreviewed extra evidence card cannot be inserted silently',()=>{
  const bad={...gem,evidence:[...gem.evidence,{id:'A99',kind:'映像',title:'謎の記録',body:'別の犯人がいた。',facts:[]}]};reject(bad);
});
test('IR-02: all 12 actor derivations remain consistent with proof contracts',()=>{
  for(const v of VARIANTS){
    const ids=Object.keys(EVIDENCE_PROPOSITIONS[v.id]).filter(id=>EVIDENCE_PROPOSITIONS[v.id][id].fact==='actor');
    for(const id of ids)assert.equal(deriveProofActor(v,[id]),v.culprit);
  }
});
