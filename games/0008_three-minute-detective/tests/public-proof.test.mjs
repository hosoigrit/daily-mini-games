import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, VARIANTS } from '../case-data.mjs';
import { evaluateProof } from '../engine.mjs';

const card = (id, key) => VARIANTS.find(variant => variant.id === id).evidence.find(item => item.id === key).body;

test('宝石A/Bの点検結果と14:30の正式報告を区別する', () => {
  assert.match(CASES[0].lead, /14時30分に正式に報告/);
  assert.match(card('gem-a', 'A01'), /14:15.*消えていた/);
  assert.match(card('gem-b', 'B01'), /14:00.*消えていた/);
});

for (const [variant, opening, alternatives, interval, actor] of [
  ['gem-c', 'C03', ['C04', 'C05'], '13:21:00〜13:21:40', 'ソラ'],
  ['clk-c', 'K303', ['K304', 'K305'], '16:18:00〜16:18:50', 'ナオ'],
]) {
  test(variant + ' の両方の実行者証拠が開放の全区間を覆う', () => {
    assert.ok(card(variant, opening).includes(interval));
    for (const alternative of alternatives) {
      const body = card(variant, alternative);
      assert.ok(body.includes(interval), alternative);
      assert.match(body, new RegExp('全区間.*' + actor + 'だけ'), alternative);
    }
  });
}

for (const [variant, record, alternatives, id, actor] of [
  ['har-a', 'H102', ['H103', 'H104'], 'P-54', 'タクミ'],
  ['har-b', 'H202', ['H203', 'H204'], 'E-07', 'リサ'],
]) {
  test(variant + ' の通過記録と両方の実行者証拠が同じ有効化操作を示す', () => {
    const v = VARIANTS.find(item => item.id === variant);
    const gate = variant === 'har-a' ? 'H101' : 'H201';
    assert.match(v.premise, /ゲート.*自動.*変更できない/);
    assert.ok(card(variant, gate).includes(id));
    assert.match(card(variant, record), new RegExp(id + '.*有効化'));
    for (const alternative of alternatives) {
      assert.match(card(variant, alternative), new RegExp(actor + '.*' + id + '.*有効化'));
      assert.equal(evaluateProof(v, v.culprit, [gate, record, alternative]).status, 'solved');
    }
  });
}

test('時計塔BのK204はアキラ本人による無効化の確定と完了を映している', () => {
  const body = card('clk-b', 'K204');
  assert.match(body, /17:52.*アキラ本人.*専用キー.*生体認証/);
  assert.match(body, /「18:00の鐘を無効化」.*確定.*完了.*連続映像/);
});

test('時計塔BはK203とK204をそれぞれ受理し、必要な証拠が欠ければ不成立', () => {
  const variant = VARIANTS.find(item => item.id === 'clk-b');
  for (const actorCard of ['K203', 'K204']) {
    const proof = ['K201', 'K202', actorCard];
    assert.equal(evaluateProof(variant, 'akira', proof).status, 'solved', actorCard);
    for (const omitted of proof) {
      const incomplete = proof.filter(id => id !== omitted);
      assert.equal(evaluateProof(variant, 'akira', incomplete).status, 'insufficient', omitted);
    }
  }
});
