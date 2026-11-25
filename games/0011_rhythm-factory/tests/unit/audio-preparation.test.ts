import { describe, expect, it, vi } from 'vitest';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type { AudioEvent, MusicDefinition, Token, Us } from '../../src/contracts/interface_contracts';
import { createAudioPreparation } from '../../src/infrastructure/audio-preparation';
import { InvalidMusicDefinition } from '../../src/infrastructure/offline-music';

const result = { buffer: {} as AudioBuffer, durationUs: 24_000_000 as Us };
const token = (n: number): Token => ({ requestId: String(n), generation: n, sessionId: 'prep' });

describe('TC-D4-001/039/042 POC-17', () => {
  it('keeps one render in flight and retains only the final selected preparation', async () => {
    const tasks: { definition: MusicDefinition; done: () => void }[] = [];
    const events: AudioEvent[] = [];
    const render = vi.fn((definition: MusicDefinition) => new Promise<typeof result>((resolve) => {
      tasks.push({ definition, done: () => resolve(result) });
    }));
    const service = createAudioPreparation(render, (event) => events.push(event));
    const second = { ...stageA2TrialMusic };
    const third = { ...stageA2TrialMusic };
    const a = service.renderMusic(stageA2TrialMusic, token(1));
    const b = service.renderMusic(second, token(2));
    const c = service.renderMusic(third, token(3));
    expect(service.status()).toEqual({ rendering: 1, cached: 0 });
    expect(render).toHaveBeenCalledTimes(1);
    expect(await b).toMatchObject({ ok: false, error: { messageKey: 'audio.superseded' } });
    tasks[0]!.done();
    expect(await a).toMatchObject({ ok: false, error: { messageKey: 'audio.superseded' } });
    expect(render).toHaveBeenCalledTimes(2);
    expect(tasks[1]?.definition).toBe(third);
    expect(events).toEqual([]);
    tasks[1]!.done();
    expect(await c).toMatchObject({ ok: true, value: { sampleRate: 48_000, channels: 2 } });
    expect(events).toMatchObject([{ requestId: '3', kind: 'PREPARED' }]);
    expect(service.status()).toEqual({ rendering: 0, cached: 1 });
    expect(await service.renderMusic(third, token(4))).toEqual(await c);
    expect(render).toHaveBeenCalledTimes(2);
    service.dispose();
    expect(service.status()).toEqual({ rendering: 0, cached: 0 });
  });

  it('reports invalid content and rendering failure, then retries rather than caching failure', async () => {
    const render = vi.fn<() => Promise<typeof result>>()
      .mockRejectedValueOnce(new InvalidMusicDefinition('invalid definition'))
      .mockRejectedValueOnce(Error('render failed'))
      .mockResolvedValueOnce(result);
    const service = createAudioPreparation(render, () => {});
    expect(await service.renderMusic(stageA2TrialMusic, token(1))).toMatchObject({ ok: false, error: { code: 'ERR-001' } });
    expect(await service.renderMusic(stageA2TrialMusic, token(2))).toMatchObject({ ok: false, error: { code: 'ERR-003' } });
    expect(service.status().cached).toBe(0);
    expect(await service.renderMusic(stageA2TrialMusic, token(3))).toMatchObject({ ok: true });
    expect(service.status().cached).toBe(1);
    expect(render).toHaveBeenCalledTimes(3);
  });
});
