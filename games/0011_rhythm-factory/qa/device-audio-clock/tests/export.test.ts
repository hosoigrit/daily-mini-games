import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyJson, downloadJson, exportJson } from '../src/export';
import { makeEvidence } from '../src/model';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('local JSON evidence', () => {
  it('serializes finite zero distinctly from unavailable and nonfinite numbers', () => {
    expect(JSON.parse(exportJson({ values: [0, NaN, Infinity, -Infinity, null] }))).toEqual({ values: [0, null, null, null, null] });
    const empty = JSON.parse(exportJson(makeEvidence([])));
    expect(empty.summary).toMatchObject({ successfulTrials: 0, unexecutedTrials: 21, syncDifferenceMs: { max: null } });
  });

  it('rejects an unserializable value without claiming a file save', () => {
    expect(() => exportJson(undefined)).toThrow('JSONに変換できる');
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => exportJson(cyclic)).toThrow();
  });

  it('requests only a local download and revokes the temporary URL', () => {
    vi.useFakeTimers();
    const anchor = { download: '', href: '', hidden: false, click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal('document', { createElement: () => anchor, body: { append } });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qa-test');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    expect(downloadJson('{}')).toEqual({ status: 'requested', reason: null });
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.download).toBe('game0011-stage-a2a-r3-device-qa.json');
    expect(append).toHaveBeenCalledOnce();
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:qa-test');
  });

  it('records missing download support and blocked download creation', () => {
    vi.stubGlobal('document', { createElement: () => ({ remove: vi.fn() }) });
    expect(downloadJson('{}')).toMatchObject({ status: 'failed', reason: expect.any(String) });
    vi.stubGlobal('document', { createElement: () => ({ download: '', remove: vi.fn() }) });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('blocked'); });
    expect(downloadJson('{}')).toMatchObject({ status: 'failed', reason: expect.any(String) });
  });

  it('records unsupported or rejected clipboard access', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyJson('{}')).resolves.toMatchObject({ status: 'failed', reason: expect.any(String) });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await expect(copyJson('{}')).resolves.toMatchObject({ status: 'failed', reason: expect.any(String) });
  });

  it('confirms only a resolved clipboard operation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyJson('{}')).resolves.toEqual({ status: 'confirmed', reason: null });
    expect(writeText).toHaveBeenCalledWith('{}');
  });
});
