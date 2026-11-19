import test from "node:test";
import assert from "node:assert/strict";
import {
  LANDING,
  judgeLanding,
  overlapWidth,
  perfectTolerance,
  positionAt,
  scoreLanding,
  speedForFloor,
} from "../src/rules.mjs";

const block = (x, width) => ({ x, y: 100, width, height: 26 });
const closeTo = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test("TC-001: 1階の速度は90px/s", () => assert.equal(speedForFloor(1), 90));
test("TC-002: 10階の速度は180px/s", () => assert.equal(speedForFloor(10), 180));
test("TC-003: 5階の速度は130px/s", () => assert.equal(speedForFloor(5), 130));
test("速度関数は範囲外の階を拒否する", () => {
  assert.throws(() => speedForFloor(0), RangeError);
  assert.throws(() => speedForFloor(11), RangeError);
});
test("TC-004: 1階を0.5秒進むとx=45", () => {
  assert.equal(positionAt({ width: 180, elapsedSeconds: 0.5, floor: 1 }), 45);
});
test("TC-005: 1階を2秒進むと右端x=180", () => {
  assert.equal(positionAt({ width: 180, elapsedSeconds: 2, floor: 1 }), 180);
});
test("TC-006: 1階を3秒進むと反射後x=90", () => {
  assert.equal(positionAt({ width: 180, elapsedSeconds: 3, floor: 1 }), 90);
});
test("TC-007: 複数回の壁跨ぎでも余剰距離を失わない", () => {
  const actual = positionAt({ width: 180, elapsedSeconds: 18.5, floor: 1 });
  assert.equal(actual, 135);
  assert.ok(actual >= 0 && actual <= 180);
});
test("TC-008: 60Hzと120Hz相当の合計経過時間で位置が一致する", () => {
  const elapsed60 = Array.from({ length: 60 }, () => 1 / 60).reduce((a, b) => a + b, 0);
  const elapsed120 = Array.from({ length: 120 }, () => 1 / 120).reduce((a, b) => a + b, 0);
  closeTo(
    positionAt({ width: 180, elapsedSeconds: elapsed60, floor: 7 }),
    positionAt({ width: 180, elapsedSeconds: elapsed120, floor: 7 }),
    1e-9,
  );
});
test("偶数階は右端から開始する", () => {
  assert.equal(positionAt({ width: 180, elapsedSeconds: 0, floor: 2 }), 180);
});

test("TC-009: 完全一致はPERFECTで幅を維持する", () => {
  const result = judgeLanding(block(100, 160), block(100, 160));
  assert.equal(result.kind, LANDING.PERFECT);
  assert.equal(result.block.x, 100);
  assert.equal(result.block.width, 160);
});
test("TC-010: 誤差8はPERFECT境界に含む", () => {
  assert.equal(judgeLanding(block(100, 160), block(108, 160)).kind, LANDING.PERFECT);
});
test("TC-011: 誤差8.01はNORMALで切り落とす", () => {
  const result = judgeLanding(block(100, 160), block(108.01, 160));
  assert.equal(result.kind, LANDING.NORMAL);
  closeTo(result.block.width, 151.99);
});
test("TC-012: 20pxずれは幅140のNORMAL", () => {
  const result = judgeLanding(block(100, 160), block(120, 160));
  assert.equal(result.kind, LANDING.NORMAL);
  assert.equal(result.block.x, 120);
  assert.equal(result.block.width, 140);
});
test("TC-013: 重なり0はMISS", () => {
  const result = judgeLanding(block(100, 160), block(260, 160));
  assert.equal(result.kind, LANDING.MISS);
  assert.equal(result.block, null);
});
test("TC-014: 重なり0.1はNORMALで継続", () => {
  const result = judgeLanding(block(100, 160), block(259.9, 160));
  assert.equal(result.kind, LANDING.NORMAL);
  closeTo(result.block.width, 0.1);
});
test("TC-015: 幅20の許容誤差5はPERFECT", () => {
  assert.equal(perfectTolerance(20), 5);
  assert.equal(judgeLanding(block(100, 20), block(105, 20)).kind, LANDING.PERFECT);
});
test("TC-016: 幅2の許容誤差0.5はPERFECT", () => {
  assert.equal(perfectTolerance(2), 0.5);
  assert.equal(judgeLanding(block(100, 2), block(100.5, 2)).kind, LANDING.PERFECT);
});
test("TC-017: 幅2で誤差0.51はNORMAL", () => {
  const result = judgeLanding(block(100, 2), block(100.51, 2));
  assert.equal(result.kind, LANDING.NORMAL);
  closeTo(result.block.width, 1.49);
});
test("TC-018: 1e-9の正の重なりをMISSへ丸めない", () => {
  const support = block(0, 1);
  const moving = block(1 - 1e-9, 1);
  const result = judgeLanding(support, moving);
  assert.equal(result.kind, LANDING.NORMAL);
  assert.ok(result.block.width > 0);
});
test("TC-019: 通常着地の次ブロックに使える幅は重なり幅そのもの", () => {
  const result = judgeLanding(block(100, 160), block(120, 160));
  assert.equal(result.block.width, 140);
  assert.ok(result.block.width <= 160);
});
test("区間重なりは左右どちらのはみ出しでも同じ式で求まる", () => {
  assert.equal(overlapWidth(block(100, 160), block(90, 160)), 150);
  assert.equal(overlapWidth(block(100, 160), block(110, 160)), 150);
});

test("TC-020: NORMALは100点でコンボ0", () => {
  assert.deepEqual(scoreLanding(4, LANDING.NORMAL), { scoreDelta: 100, nextStreak: 0 });
});
test("TC-021: 1回目のPERFECTは150点", () => {
  assert.deepEqual(scoreLanding(0, LANDING.PERFECT), { scoreDelta: 150, nextStreak: 1 });
});
test("TC-022: 2回目のPERFECTは160点・累計310点", () => {
  const first = scoreLanding(0, LANDING.PERFECT);
  const second = scoreLanding(first.nextStreak, LANDING.PERFECT);
  assert.equal(second.scoreDelta, 160);
  assert.equal(first.scoreDelta + second.scoreDelta, 310);
});
test("TC-023: 6回目以降のコンボボーナスは50点が上限", () => {
  assert.equal(scoreLanding(5, LANDING.PERFECT).scoreDelta, 200);
  assert.equal(scoreLanding(99, LANDING.PERFECT).scoreDelta, 200);
});
test("TC-024: PERFECT→NORMAL→PERFECTでコンボを再開する", () => {
  const first = scoreLanding(0, LANDING.PERFECT);
  const normal = scoreLanding(first.nextStreak, LANDING.NORMAL);
  const next = scoreLanding(normal.nextStreak, LANDING.PERFECT);
  assert.deepEqual([first.scoreDelta, normal.scoreDelta, next.scoreDelta], [150, 100, 150]);
  assert.equal(next.nextStreak, 1);
});
test("TC-025: 10回連続PERFECTの理論最高点は1850", () => {
  let score = 0;
  let streak = 0;
  for (let count = 0; count < 10; count += 1) {
    const result = scoreLanding(streak, LANDING.PERFECT);
    score += result.scoreDelta;
    streak = result.nextStreak;
  }
  assert.equal(score, 1850);
});
