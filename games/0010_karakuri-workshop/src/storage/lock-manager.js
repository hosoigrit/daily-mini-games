import {LOCK_NAME} from './save-validator.js';

export function createSaveLock(locks) {
  let generation = 0;
  let releaseLease = null;
  let pending = null;
  const current = () => generation;
  function release() {
    generation++;
    releaseLease?.();
    releaseLease = null;
    pending = null;
  }
  return {
    current,
    isOwner: token => Boolean(releaseLease) && token === generation,
    release,
    acquire() {
      if (releaseLease) return Promise.resolve({mode:'OWNER',generation});
      if (pending) return pending;
      if (!locks?.request) return Promise.resolve({mode:'DEGRADED',generation});
      const attempt = ++generation;
      pending = new Promise(resolve => {
        try {
          Promise.resolve(locks.request(LOCK_NAME, {mode:'exclusive',ifAvailable:true}, lock => {
            if (generation !== attempt || !lock) {
              resolve({mode:'READ_ONLY',generation:attempt});
              return undefined;
            }
            return new Promise(hold => {
              releaseLease = hold;
              resolve({mode:'OWNER',generation:attempt});
            });
          })).catch(() => resolve({mode:'DEGRADED',generation:attempt}));
        } catch {
          resolve({mode:'DEGRADED',generation:attempt});
        }
      }).finally(() => {
        if (generation === attempt) pending = null;
      });
      return pending;
    },
  };
}
