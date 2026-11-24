import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES} from '../case-data.mjs';

// Guardrails for two independently observed narrative continuity gaps.
// These are textual regression checks, not machine proofs of real-world causality.
const byCase = id => CASES.find(c=>c.id===id);
const byTruth = (c,id) => c.variants.find(v=>v.id===id);
const card = (v,id) => v.evidence.find(e=>e.id===id);

test('CASE002 paper route explicitly reaches the outside bulletin board', () => {
  const c=byCase('manuscript');
  const b=byTruth(c,'man-b');
  assert.match(c.lead,/17時.*社外の編集掲示板/);
  assert.match(card(b,'M201').body,/16:39.*掲示板.*紙面写真.*透かし/);
  assert.match(card(b,'M204').body,/発送先.*投稿元.*一致/);
  assert.match(b.explanation,/掲示板.*紙面写真.*トウマ/);
  assert.match(c.rules.join(' '),/社外公開は.*流出から生じた/);
});

test('CASE004 distinguishes authentic-looking paper from authorized permit', () => {
  const c=byCase('harbor');
  const a=byTruth(c,'har-a');
  assert.match(c.rules.join(' '),/正規.*承認.*無効/);
  assert.match(a.premise,/操作は正規の審査承認とは別/);
  assert.match(card(a,'H101').body,/正規の審査承認はなく/);
  assert.match(card(a,'H102').body,/19:54.*印刷.*有効化/);
  assert.match(card(a,'H103').body,/掌紋認証.*タクミ/);
  assert.match(a.explanation,/承認を経ずに通行書を作成/);
  assert.doesNotMatch(card(a,'H101').body,/正規発行記録はない/);
});

test('case framing and solution captions remain present for all 12 truths', () => {
  assert.equal(CASES.length,4);
  for(const c of CASES){
    assert.equal(c.variants.length,3, c.id);
    assert.ok(c.lead.length>20,c.id);
    assert.ok(c.rules.length>=3,c.id);
    for(const v of c.variants){
      assert.equal(v.caseId,c.id,v.id);
      assert.equal(v.statements.length,3,v.id);
      assert.equal(v.hints.length,2,v.id);
      assert.ok(v.explanation.length>=70,v.id);
      assert.ok(v.premise.length>=30,v.id);
    }
  }
});

test('CASE004 asks for the initiator of the unauthorized pass, not simply the guard who checked it', () => {
  const c=byCase('harbor');
  assert.match(c.lead,/許可の偽装、または緊急開放の不正操作/);
  assert.match(c.rules.join(' '),/共犯・なりすましはない/);
});
