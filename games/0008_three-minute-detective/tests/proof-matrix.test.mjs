import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, suspectsFor } from '../case-data.mjs';
import { evaluateProof, MAX_EVIDENCE } from '../engine.mjs';

/** Exhaustive regression of ALL legal 2–4-card submissions for all 12 truths. */
test('12-truth proof matrix remains deterministic and excludes false-positive culprits',()=>{
  const tally={submissions:0,success:0,insufficient:0,wrongPerson:0,invalid:0};
  for(const variant of VARIANTS){
    const ids=variant.evidence.map(e=>e.id);
    const combinations=[];
    const enumerate=(start,items)=>{
      if(items.length>=2)combinations.push(items);
      if(items.length===MAX_EVIDENCE)return;
      for(let i=start;i<ids.length;i++)enumerate(i+1,[...items,ids[i]]);
    };
    enumerate(0,[]);
    let hasSolution=false;
    for(const person of suspectsFor(variant)){
      for(const cards of combinations){
        const outcome=evaluateProof(variant,person.id,cards);
        tally.submissions++;
        if(outcome.status==='solved'){
          tally.success++;hasSolution=true;
          assert.equal(person.id,variant.culprit,`${variant.id} solved by incorrect culprit ${person.id}`);
        }else if(outcome.status==='insufficient')tally.insufficient++;
        else if(outcome.status==='wrong-person')tally.wrongPerson++;
        else tally.invalid++;
      }
    }
    assert.equal(hasSolution,true,`${variant.id}: no successful legal proof`);
  }
  assert.deepEqual(tally,{submissions:1200,success:53,insufficient:1041,wrongPerson:106,invalid:0});
});
