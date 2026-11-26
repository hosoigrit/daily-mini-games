import assert from './evidence.mjs';
import { ProgressStore, SAVE_KEY } from '../src/progress.mjs';
import { runCase } from './adapter.mjs';

const initial = '{"schemaVersion":1,"stages":{}}';
const unsupported = '{"schemaVersion":999,"stages":{}}';
const corrupt = '{oops';
const other = 'daily-mini-games:other:progress:v1';
const previous = (bestStars, minMoves) => JSON.stringify({
  schemaVersion: 1, stages: { 1: { cleared: true, bestStars, minMoves } }
});
const expectedClear = { cleared: true, bestStars: 3, minMoves: 8 };

function storageOf(raw = null) {
  const values = new Map(raw === null ? [] : [[SAVE_KEY, raw]]);
  const operations = [];
  const storage = {
    getItem(key) {
      operations.push(['get', key]);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      operations.push(['set', key, value]);
      values.set(key, value);
    }
  };
  return { storage, values, operations, writes: () => operations.filter(x => x[0] === 'set') };
}

const gc = index => runCase(index).adapter.state.clearResult;

export function registerProgress(add) {
  add('SAV-01', () => {
    const f = storageOf(), store = new ProgressStore(f.storage);
    assert.deepEqual(store.progress, JSON.parse(initial));
    assert.equal(store.mode, 'NORMAL');
    assert.equal(store.isUnlocked('1'), true);
    assert.equal(store.isUnlocked('2'), false);
    assert.deepEqual(f.writes(), []);
  });
  add('SAV-02', () => {
    const f = storageOf(initial), store = new ProgressStore(f.storage);
    assert(!store.isUnlocked(2));
    store.clear(1, gc(0));
    assert(store.isUnlocked(2));
    assert(!store.isUnlocked(3));
    assert.deepEqual(store.stage(1), expectedClear);
    assert.equal(f.values.get(SAVE_KEY), previous(3, 8));
  });
  add('SAV-03', () => {
    const f = storageOf(previous(3, 8)), store = new ProgressStore(f.storage);
    assert.deepEqual(store.stage(1), expectedClear);
    assert(store.isUnlocked(2));
    assert.deepEqual(f.writes(), []);
  });
  for (const [id, before, submitted, after] of [
    ['SAV-04', [1, 12], { stars: 3, totalMoves: 8 }, expectedClear],
    ['SAV-05', [3, 8], { stars: 2, totalMoves: 10 }, expectedClear],
    ['SAV-06', [3, 10], gc(0), expectedClear]
  ]) add(id, () => {
    const f = storageOf(previous(...before)), store = new ProgressStore(f.storage);
    store.clear(1, submitted);
    assert.deepEqual(store.stage(1), after);
    assert.deepEqual(JSON.parse(f.values.get(SAVE_KEY)).stages[1], after);
  });
  add('SAV-07', () => {
    let attempts = 0;
    const reject = () => { attempts++; throw new DOMException('Denied', 'SecurityError'); };
    const store = new ProgressStore({ getItem: reject, setItem: reject });
    store.clear(1, gc(0));
    assert.equal(store.mode, 'VOLATILE_ONLY');
    assert.deepEqual(store.stage(1), expectedClear);
    assert.equal(attempts, 1);
  });
  for (const [id, raw, error] of [
    ['SAV-08', corrupt, 'ERR_SAVE_CORRUPTED'],
    ['SAV-09', unsupported, 'ERR_VERSION_UNSUPPORTED'],
    ['SAV-10', '{"schemaVersion":1,"stages":{"bad-key":{"cleared":true,"bestStars":1,"minMoves":10}}}', 'ERR_SAVE_CORRUPTED'],
    ['SAV-11', previous(3, -1), 'ERR_SAVE_CORRUPTED']
  ]) add(id, () => {
    const fixtures = id === 'SAV-11' ? [raw, previous(9, 10)] : [raw];
    for (const input of fixtures) {
      const f = storageOf(input), store = new ProgressStore(f.storage);
      assert.equal(store.mode, 'VOLATILE_ONLY');
      assert.equal(store.error, error);
      assert(!store.isUnlocked(2));
      assert.equal(f.values.get(SAVE_KEY), input);
      assert.deepEqual(f.writes(), []);
    }
  });
  add('SAV-12', () => {
    const f = storageOf(initial), store = new ProgressStore(f.storage);
    f.values.set(other, ' sentinel\r\n');
    store.clear(1, gc(0));
    assert.equal(f.values.get(other), ' sentinel\r\n');
    assert(f.operations.every(x => x[1] === SAVE_KEY));
  });
  for (const [id, raw] of [['SAV-13', corrupt], ['SAV-14', unsupported], ['SAV-16', corrupt]]) {
    add(id, () => {
      const f = storageOf(raw), store = new ProgressStore(f.storage);
      store.clear(1, gc(0));
      if (id === 'SAV-16') {
        store.clear(2, gc(1));
        assert(store.isUnlocked(3));
        assert(!new ProgressStore(f.storage).isUnlocked(2));
      }
      assert.equal(store.mode, 'VOLATILE_ONLY');
      assert.deepEqual(store.stage(1), expectedClear);
      assert.equal(f.values.get(SAVE_KEY), raw);
      assert.deepEqual(f.writes(), []);
    });
  }
  add('SAV-15', () => {
    const f = storageOf(initial), store = new ProgressStore(f.storage);
    let writes = 0;
    f.storage.setItem = () => { writes++; throw new DOMException('Full', 'QuotaExceededError'); };
    store.clear(1, gc(0));
    store.clear(2, gc(1));
    assert.equal(writes, 1);
    assert.equal(store.mode, 'VOLATILE_ONLY');
    assert.equal(store.error, 'ERR_SAVE_FAILED');
    assert(store.isUnlocked(3));
    assert.equal(f.values.get(SAVE_KEY), initial);
  });
  add('SAV-19', () => {
    for (const observed of [true, false]) {
      const f = storageOf(corrupt), store = new ProgressStore(f.storage);
      assert(store.beginReset());
      assert(store.confirmLoss());
      f.values.set(SAVE_KEY, 'R2');
      if (observed) store.observeStorageChange();
      assert(!store.confirmReset());
      assert.equal(store.error, 'ERR_SAVE_CONFLICT');
      assert.equal(store.mode, 'VOLATILE_ONLY');
      assert.equal(f.values.get(SAVE_KEY), 'R2');
      assert.deepEqual(f.writes(), []);
    }
  });
  add('SAV-20', () => {
    for (const failure of ['write', 'readback', 'different']) {
      const f = storageOf(corrupt), store = new ProgressStore(f.storage);
      const put = f.storage.setItem;
      let writes = 0;
      f.storage.setItem = (key, value) => {
        writes++;
        if (failure === 'write') throw Error('quota');
        if (failure === 'readback') f.storage.getItem = () => { throw Error('denied'); };
        if (failure === 'different') return put(key, 'R2');
        return put(key, value);
      };
      assert(store.beginReset() && store.confirmLoss());
      assert(!store.confirmReset());
      assert(!store.confirmReset());
      assert.equal(writes, 1);
      assert.equal(store.mode, 'VOLATILE_ONLY');
      assert.equal(store.error, 'ERR_SAVE_FAILED');
    }
  });
  add('SAV-21', () => {
    const f = storageOf(unsupported), normalRead = f.storage.getItem;
    const store = new ProgressStore(f.storage);
    assert.equal(store.error, 'ERR_VERSION_UNSUPPORTED');
    assert.equal(store.mode, 'VOLATILE_ONLY');
    assert.equal(f.values.get(SAVE_KEY), unsupported);
    f.storage.getItem = () => { throw Error('denied'); };
    assert(store.beginReset() && store.confirmLoss());
    assert(!store.confirmReset());
    const inaccessible = new ProgressStore(f.storage);
    assert(!inaccessible.canReset && !inaccessible.beginReset() && !inaccessible.confirmReset());
    assert.deepEqual(f.writes(), []);
    assert.equal(normalRead(SAVE_KEY), unsupported);
  });
}
