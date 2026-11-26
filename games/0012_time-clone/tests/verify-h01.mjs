import assert from './evidence.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repo = new URL('../../../', import.meta.url);
export const e1 = new URL('handoffs/game-0012/e1/', repo);
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const read = path => readFileSync(new URL(path, e1), 'utf8').replace(/^\uFEFF/, '');
export const json = path => JSON.parse(read(path));

export function csv(path) {
  const input = read(path).trimEnd();
  const rows = input.split(/\r?\n/).map(line => {
    const fields = [...line.matchAll(/(?:^|,)(?:"((?:""|[^"])*)"|([^,]*))/g)];
    return fields.map(match => match[1]?.replaceAll('""', '"') ?? match[2]);
  });
  const keys = rows.shift();
  return rows.map(values => {
    assert.equal(values.length, keys.length, path);
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  });
}

export const goldenPath = '02_reference/game0012_golden_cases_v0_2_DRAFT.json';
export const recordPath = '02_reference/game0012_golden_record_reference_v0_2_DRAFT.csv';
export const supplements = JSON.parse(readFileSync(new URL('./record-events-t1-h01.json', import.meta.url)));

export function verifyH01() {
  for (const source of supplements.sources) {
    assert.equal(sha256(readFileSync(new URL(source.path, repo))), source.sha256);
  }
  assert.equal(supplements.e1Commit, '85f51abd7260fc71b3abe11880269fb0c9c1b800');
  const golden = json(goldenPath).cases;
  const records = csv(recordPath);
  const counts = { executed: 0, changed: 0, unchanged: 0, padding: 0, initial: 0 };
  assert.deepEqual(Object.keys(supplements.cases), golden.map(x => x.caseId));
  for (const data of golden) {
    const rows = records.filter(row => row.case_id === data.caseId);
    assert.equal(rows.length, 17);
    assert.equal(supplements.cases[data.caseId].length, data.recordCompletedTicks);
    const doorIds = Object.keys(data.doorRules).sort();
    const switchIds = [...new Set(Object.values(data.doorRules).flatMap(rule => rule.requiredSwitchIds))].sort();
    let switches = [];
    let latch = [];
    let doors = doorIds.map(() => 'CLOSED');
    for (const [tick, position] of data.recordPositions.entries()) {
      const row = rows[tick];
      assert.equal(row.tick, String(tick));
      assert.equal(row.events, '');
      assert.equal(row.is_padding, String(position.padding).replace(/^[ft]/, l => l.toUpperCase()));
      assert.deepEqual([Number(row.player_x), Number(row.player_y)], [position.x, position.y]);
      assert.equal(Number(row.record_completed_ticks), data.recordCompletedTicks);
      if (position.padding) {
        assert(tick > data.recordCompletedTicks);
        assert.equal(row.game_phase, 'NOT_EXECUTED_PADDING');
        counts.padding++;
        continue;
      }

      assert.equal(row.game_phase, 'RECORDING');
      const tile = data.mapRows[position.y][position.x];
      const nextSwitches = switchIds.filter(id => id === tile);
      const nextLatch = doorIds.filter(id => {
        const rule = data.doorRules[id];
        return rule.type === 'LATCH' && (latch.includes(id) || rule.requiredSwitchIds.every(s => nextSwitches.includes(s)));
      });
      const nextDoors = doorIds.map(id => {
        const rule = data.doorRules[id];
        if (rule.type === 'LATCH') return nextLatch.includes(id) ? 'OPEN' : 'CLOSED';
        if (rule.requiredSwitchIds.every(s => nextSwitches.includes(s))) return 'OPEN';
        return tile === id ? 'HELD_OPEN' : 'CLOSED';
      });

      const ordered = [];
      for (const id of switchIds) {
        if (switches.includes(id) !== nextSwitches.includes(id)) {
          ordered.push(`SW_${id}_${nextSwitches.includes(id) ? 'ON' : 'OFF'}`);
        }
      }
      for (const id of nextLatch) {
        if (!latch.includes(id)) ordered.push(`LATCH_${id}_UNLOCK`);
      }
      doorIds.forEach((id, i) => {
        if (doors[i] !== nextDoors[i]) ordered.push(`DOOR_${id}_${nextDoors[i]}`);
      });
      assert.deepEqual(row.switches_on.split(';').filter(Boolean).sort(), nextSwitches);
      assert.deepEqual(row.latched.split(';').filter(Boolean).sort(), nextLatch);
      assert.deepEqual(row.doors.split(';').sort(), doorIds.map((id, i) => `${id}:${nextDoors[i]}`));
      if (tick === 0) {
        assert.deepEqual(ordered, []);
        counts.initial++;
      } else {
        assert.deepEqual(supplements.cases[data.caseId][tick - 1], { tick, events: ordered }, `${data.caseId}/${tick}`);
        counts.executed++;
        counts[ordered.length ? 'changed' : 'unchanged']++;
      }
      switches = nextSwitches;
      latch = nextLatch;
      doors = nextDoors;
    }
  }
  assert.deepEqual(counts, { executed: 41, changed: 11, unchanged: 30, padding: 71, initial: 7 });
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyH01()));
}
