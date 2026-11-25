export const GAME_ID = '0009_three-move-hero';
export const SETTINGS_KEY = 'daily-mini-games:0009:settings:v1';

export function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
}

export function validPreferences(value) {
  return exactFields(value, ['reducedMotion', 'battleSpeed']) &&
    typeof value.reducedMotion === 'boolean' && ['normal', 'fast', 'instant'].includes(value.battleSpeed);
}

export function browserDependency(get) {
  try { return get(); } catch { return undefined; }
}

export function createSettingsStorage(storage = browserDependency(() => globalThis.localStorage)) {
  function load() {
    let raw;
    try { raw = storage.getItem(SETTINGS_KEY); } catch { return { status: 'not_saved', reason: 'read_failed' }; }
    if (raw === null) return { status: 'empty', preferences: { reducedMotion: false, battleSpeed: 'normal' } };
    try {
      const data = JSON.parse(raw);
      const { gameId, settingsSchemaVersion, ...preferences } = data;
      if (gameId === GAME_ID && settingsSchemaVersion === 1 && validPreferences(preferences)) {
        return { status: 'saved', preferences };
      }
    } catch { /* Keep the original value available for inspection. */ }
    return { status: 'blocked', reason: 'invalid_settings' };
  }

  function save(preferences, { onlyIfAbsent = false } = {}) {
    if (!validPreferences(preferences)) return { status: 'blocked', reason: 'invalid_preferences' };
    const current = load();
    if (current.status === 'not_saved' || current.status === 'blocked') return current;
    if (onlyIfAbsent && current.status !== 'empty') return current;
    const raw = JSON.stringify({ settingsSchemaVersion: 1, gameId: GAME_ID, ...preferences });
    try { storage.setItem(SETTINGS_KEY, raw); } catch (error) {
      return { status: ['QuotaExceededError', 'SecurityError'].includes(error?.name) ? 'not_saved' : 'unverified',
        reason: 'write_failed' };
    }
    const checked = load();
    if (checked.status === 'saved' && checked.preferences.reducedMotion === preferences.reducedMotion &&
        checked.preferences.battleSpeed === preferences.battleSpeed) return checked;
    return { status: 'unverified', reason: 'readback_failed' };
  }

  return { load, save };
}
