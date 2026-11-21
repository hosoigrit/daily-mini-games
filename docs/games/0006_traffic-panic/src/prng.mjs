export function fnv1a32(text) {
  if (typeof text !== "string") throw new TypeError("FNV_INPUT_NOT_STRING");
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function xorshift32(value) {
  let x = value >>> 0;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  return x >>> 0;
}

export function phaseSeed(ruleVersion, seedId, phaseId) {
  const hash = fnv1a32(`${ruleVersion}|${seedId}|${phaseId}`);
  return hash === 0 ? 0x9e3779b9 : hash;
}
