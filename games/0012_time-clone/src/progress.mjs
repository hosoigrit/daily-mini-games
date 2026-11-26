export const SAVE_KEY = 'daily-mini-games:game-0012:progress:v1';
const empty = () => ({ schemaVersion: 1, stages: {} });
const validId = id => /^[1-6]$/.test(id);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const validMoves = n => Number.isSafeInteger(n) && n >= 0;
const validStars = n => Number.isInteger(n) && n >= 1 && n <= 3;

function parse(raw) {
  if (raw === null) return empty();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('ERR_SAVE_CORRUPTED');
  }
  if (!plain(data) || !Object.hasOwn(data, 'schemaVersion')) throw new Error('ERR_SAVE_CORRUPTED');
  if (data.schemaVersion !== 1) throw new Error('ERR_VERSION_UNSUPPORTED');
  if (!plain(data.stages) || Object.entries(data.stages).some(([id, result]) =>
    !validId(id) || !plain(result) || typeof result.cleared !== 'boolean' ||
    (result.cleared ? !validStars(result.bestStars) || !validMoves(result.minMoves)
      : result.bestStars !== 0 || result.minMoves !== null)
  )) throw new Error('ERR_SAVE_CORRUPTED');
  return data;
}

export class ProgressStore {
  #storage;
  #raw;
  #confirmation = 0;
  #conflict = false;
  #progress = empty();
  mode = 'NORMAL';
  error = null;

  constructor(storage) {
    this.#storage = storage;
    try {
      this.#raw = this.#read();
      this.#progress = parse(this.#raw);
    } catch (error) {
      this.#volatile(error.message);
    }
  }

  #read() {
    try {
      return this.#storage.getItem(SAVE_KEY);
    } catch {
      throw new Error('ERR_SAVE_FAILED');
    }
  }

  #volatile(error) {
    this.mode = 'VOLATILE_ONLY';
    this.error = error;
  }

  get progress() {
    return structuredClone(this.#progress);
  }

  stage(id) {
    const entry = this.#progress.stages[id];
    return entry && { ...entry };
  }

  isUnlocked(id) {
    return validId(id) && (String(id) === '1' || this.#progress.stages[Number(id) - 1]?.cleared === true);
  }

  clear(id, { stars, totalMoves }) {
    if (!validId(id) || !validStars(stars) || !validMoves(totalMoves)) throw new Error('ERR_SCORE_INVALID');
    const previous = this.#progress.stages[id];
    this.#progress.stages[id] = {
      cleared: true,
      bestStars: Math.max(previous?.bestStars ?? 0, stars),
      minMoves: Math.min(previous?.minMoves ?? Infinity, totalMoves)
    };
    if (this.mode !== 'NORMAL') return;
    try {
      if (this.#read() !== this.#raw) {
        this.observeStorageChange();
        return;
      }
      const value = JSON.stringify(this.#progress);
      this.#storage.setItem(SAVE_KEY, value);
      if (this.#read() !== value) throw new Error('ERR_SAVE_FAILED');
      this.#raw = value;
    } catch {
      this.#volatile('ERR_SAVE_FAILED');
    }
  }

  observeStorageChange() {
    this.#conflict = true;
    this.#confirmation = 0;
    this.#volatile('ERR_SAVE_CONFLICT');
  }

  get canReset() {
    return this.mode === 'VOLATILE_ONLY' && this.#raw !== undefined && !this.#conflict;
  }

  exportRaw() {
    return typeof this.#raw === 'string' ? this.#raw : null;
  }

  beginReset() {
    if (!this.canReset) return false;
    this.#confirmation = 1;
    return true;
  }

  confirmLoss() {
    if (this.#confirmation !== 1 || !this.canReset) return false;
    this.#confirmation = 2;
    return true;
  }

  cancelReset() {
    this.#confirmation = 0;
  }

  confirmReset() {
    if (this.#confirmation !== 2 || !this.canReset) return false;
    this.#confirmation = 0;
    try {
      if (this.#read() !== this.#raw) {
        this.observeStorageChange();
        return false;
      }
      const progress = empty();
      const value = JSON.stringify(progress);
      this.#storage.setItem(SAVE_KEY, value);
      if (this.#read() !== value) throw new Error('ERR_SAVE_FAILED');
      this.#raw = value;
      this.#progress = progress;
      this.mode = 'NORMAL';
      this.error = null;
      return true;
    } catch {
      this.#volatile('ERR_SAVE_FAILED');
      return false;
    }
  }
}
