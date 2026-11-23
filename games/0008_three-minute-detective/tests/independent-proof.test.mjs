import test from 'node:test';
import assert from 'node:assert/strict';
import {VARIANTS,suspectsFor} from '../case-data.mjs';
import {PROOF_CONTRACTS} from '../proof-contracts.mjs';
import {deriveProofActor,evaluateProof,validateProofContract,validateCatalog,MAX_EVIDENCE} from '../engine.mjs';

const proofSelection=v=>{
  const spec=PROOF_CONTRACTS[v.id];
  const actor=Object.keys(spec.actorEvidence)[0];
  const selected=[actor];
  for(const f of spec.requiredFacts){
    if(v.evidence.some(e=>selected.includes(e.id)&&e.facts.includes(f)))continue;
    const card=v.evidence.find(e=>e.facts.includes(f));
    assert.ok(card,`missing proof card ${v.id} ${f}`);
    selected.push(card.id);
  }
  assert.ok(selected.length<=MAX_EVIDENCE,v.id);
  return selected;
};
test('IR-02 all 12 contracts derive unique culprit without reading answer key',()=>{
  assert.deepEqual(validateCatalog(),[]);
  for(const v of VARIANTS){
    const evidence=proofSelection(v),derived=deriveProofActor(v,evidence);
    assert.equal(derived,v.culprit,v.id);
    assert.equal(evaluateProof(v,derived,evidence).success,true,v.id);
    for(const s of suspectsFor(v))if(s.id!==derived)assert.equal(evaluateProof(v,s.id,evidence).success,false,v.id);
  }
});
test('IR-02 changing culprit alone cannot make wrong person a successful accusation',()=>{
  const source=VARIANTS.find(v=>v.id==='gem-a');
  const altered={...source,culprit:'aoi'};
  assert.ok(validateProofContract(altered).some(e=>e.includes('culprit disagrees')));
  assert.equal(evaluateProof(altered,'aoi',['A01','A02','A03']).success,false);
  assert.equal(evaluateProof(altered,'ren',['A01','A02','A03']).success,false);
});
test('IR-02 changing actor name in evidence text is detected',()=>{
  const source=VARIANTS.find(v=>v.id==='gem-a');
  const altered={...source,evidence:source.evidence.map(e=>e.id==='A03'?{...e,body:e.body.replace('レン','アオイ')}:e)};
  assert.ok(validateProofContract(altered).some(e=>e.includes('actor name')));
  assert.equal(evaluateProof(altered,'ren',['A01','A02','A03']).success,false);
});
test('IR-02 changing timestamp on actor evidence is detected',()=>{
  const source=VARIANTS.find(v=>v.id==='gem-b');
  const altered={...source,evidence:source.evidence.map(e=>e.id==='B03'?{...e,body:e.body.replace('13:53','13:54')}:e)};
  assert.ok(validateProofContract(altered).some(e=>e.includes('timestamp')));
});
test('IR-02 answer-proving facts cannot silently be removed',()=>{
  const source=VARIANTS.find(v=>v.id==='gem-a');
  const altered={...source,requiredFacts:['actor']};
  assert.ok(validateProofContract(altered).some(e=>e.includes('required facts')));
  assert.equal(evaluateProof(altered,'ren',['A03','A04']).success,false);
});
test('IR-02 actor label must not be omitted from actor evidence',()=>{
  const source=VARIANTS.find(v=>v.id==='clk-a');
  const altered={...source,evidence:source.evidence.map(e=>e.id==='K103'?{...e,facts:[]}:e)};
  assert.ok(validateProofContract(altered).some(e=>e.includes('invalid actor proof')));
});
