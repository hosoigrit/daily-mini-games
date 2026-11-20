import test from "node:test";
import assert from "node:assert/strict";
import { STAGES } from "../src/stages.js";
import { coordKey, isAdjacent, isInBounds, sameCoord } from "../src/game-core.js";

test("ST-01: ステージID1〜6を重複なく読み込む", () => {
  assert.deepEqual(STAGES.map((stage) => stage.id), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(STAGES.map((stage) => stage.id)).size, 6);
});

test("ST-02: 盤面サイズと荷物数が設計値に一致する", () => {
  assert.deepEqual(STAGES.map((stage) => stage.size), [4, 4, 5, 5, 6, 6]);
  assert.deepEqual(STAGES.map((stage) => stage.parcels.length), [1, 2, 2, 2, 3, 3]);
});

test("ST-03: 各役割の座標に重複がない", () => {
  for (const stage of STAGES) {
    const roleCells = [stage.start, stage.goal, ...stage.parcels, ...stage.walls].map(coordKey);
    assert.equal(new Set(roleCells).size, roleCells.length, `stage ${stage.id}`);
  }
});

test("ST-04: すべての配置座標が盤内にある", () => {
  for (const stage of STAGES) {
    for (const cell of [stage.start, stage.goal, ...stage.parcels, ...stage.walls]) {
      assert.equal(isInBounds(stage, cell), true, `stage ${stage.id}: ${coordKey(cell)}`);
    }
  }
});

test("ST-05: 設計書の例示経路6件がすべて合法", () => {
  for (const stage of STAGES) {
    const route = stage.exampleRoute;
    const walls = new Set(stage.walls.map(coordKey));
    assert.equal(sameCoord(route[0], stage.start), true, `stage ${stage.id}: starts correctly`);
    assert.equal(sameCoord(route.at(-1), stage.goal), true, `stage ${stage.id}: ends correctly`);
    assert.equal(new Set(route.map(coordKey)).size, route.length, `stage ${stage.id}: no revisit`);
    route.forEach((cell) => assert.equal(walls.has(coordKey(cell)), false, `stage ${stage.id}: no wall`));
    for (let index = 1; index < route.length; index += 1) {
      assert.equal(isAdjacent(route[index - 1], route[index]), true, `stage ${stage.id}: step ${index}`);
    }
    for (const parcel of stage.parcels) {
      const parcelIndex = route.findIndex((cell) => sameCoord(cell, parcel));
      assert.ok(parcelIndex > 0 && parcelIndex < route.length - 1, `stage ${stage.id}: parcel ${coordKey(parcel)}`);
    }
  }
});

test("ST-06: 独立した参照探索で全6面の解答存在を確認する", () => {
  for (const stage of STAGES) {
    const solution = independentSolution(stage);
    assert.ok(solution, `stage ${stage.id} must have a solution`);
    assert.equal(sameCoord(solution.at(-1), stage.goal), true);
  }
});

function independentSolution(stage) {
  const walls = new Set(stage.walls.map(coordKey));
  const parcelKeys = new Set(stage.parcels.map(coordKey));
  const route = [[...stage.start]];
  const visited = new Set([coordKey(stage.start)]);

  function walk(cell, collected) {
    const key = coordKey(cell);
    const nextCollected = new Set(collected);
    if (parcelKeys.has(key)) nextCollected.add(key);
    if (sameCoord(cell, stage.goal)) return nextCollected.size === parcelKeys.size ? route.map((item) => [...item]) : null;

    for (const [dr, dc] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = [cell[0] + dr, cell[1] + dc];
      const nextKey = coordKey(next);
      if (!isInBounds(stage, next) || walls.has(nextKey) || visited.has(nextKey)) continue;
      if (sameCoord(next, stage.goal) && nextCollected.size < parcelKeys.size) continue;
      visited.add(nextKey);
      route.push(next);
      const result = walk(next, nextCollected);
      if (result) return result;
      route.pop();
      visited.delete(nextKey);
    }
    return null;
  }

  return walk(stage.start, new Set());
}

