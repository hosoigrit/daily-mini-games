import type { Page } from '@playwright/test';

export interface ReplayStroke {
  readonly judgeUs: number;
  readonly type: 'keydown' | 'keyup';
  readonly key: string;
}

interface OutputStamp { readonly contextTime: number; readonly performanceTime: number }
interface PlaybackSource {
  readonly ordinal: number;
  readonly phaseAtStart: string | null;
  readonly domGenerationAtStart: number | null;
  readonly calledAtMs: number;
  readonly lastStampAtMs: number;
  readonly whenSec: number;
  readonly offsetSec: number;
  readonly stamp: OutputStamp;
}
interface ReplayDispatch extends ReplayStroke {
  readonly source: number;
  readonly generation: number;
  readonly plannedAtMs: number;
  readonly actualEventTimeStamp: number;
  readonly modeledOccurrenceMs: number;
  readonly invokedAtMs: number;
  readonly returnedAtMs: number;
}
interface ControlledReplayTrace {
  readonly sources: PlaybackSource[];
  readonly dispatches: ReplayDispatch[];
  readonly unexpected: string[];
}

declare global {
  interface Window { readonly stageA2dr1ControlledReplay?: ControlledReplayTrace }
}

export async function installControlledReplay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: ControlledReplayTrace = { sources: [], dispatches: [], unexpected: [] };
    const origins = new WeakMap<AudioContext, OutputStamp>();
    const lastStamps = new WeakMap<AudioContext, { stamp: OutputStamp; atMs: number }>();
    const start = AudioBufferSourceNode.prototype.start;
    Object.defineProperty(window, 'stageA2dr1ControlledReplay', { value: trace });

    // Only controlled runs replace this browser return. Synthesis and source playback remain native.
    Object.defineProperty(AudioContext.prototype, 'getOutputTimestamp', {
      configurable: true,
      value(this: AudioContext): AudioTimestamp {
        if (this.state !== 'running' || this.currentTime <= 0) return {};
        const atMs = performance.now();
        let reference = origins.get(this);
        if (!reference) {
          reference = { contextTime: this.currentTime, performanceTime: atMs };
          origins.set(this, reference);
        }
        const stamp = { contextTime: reference.contextTime + (atMs - reference.performanceTime) / 1000, performanceTime: atMs };
        lastStamps.set(this, { stamp: { ...stamp }, atMs });
        return stamp;
      },
    });

    Object.defineProperty(AudioBufferSourceNode.prototype, 'start', {
      configurable: true,
      value(this: AudioBufferSourceNode, ...args: [when?: number, offset?: number, duration?: number]): void {
        const calledAtMs = performance.now();
        const isTrialTrack = this.buffer?.length === 1_152_000 && this.buffer.sampleRate === 48_000 && args.length === 2;
        const last = isTrialTrack ? lastStamps.get(this.context as AudioContext) : undefined;
        Reflect.apply(start, this, args);
        if (!isTrialTrack) return;
        const [whenSec, offsetSec] = args;
        if (!last || whenSec === undefined || offsetSec === undefined) {
          trace.unexpected.push('Trial source did not have a same-context fixed stamp and start arguments.');
          return;
        }
        const main = document.querySelector<HTMLElement>('main[data-screen]');
        const generation = main?.dataset.generation;
        const source: PlaybackSource = { ordinal: trace.sources.length + 1, calledAtMs, lastStampAtMs: last.atMs,
          phaseAtStart: main?.dataset.state ?? null, domGenerationAtStart: generation ? Number(generation) : null,
          whenSec, offsetSec, stamp: last.stamp,
        };
        trace.sources.push(source);
        window.dispatchEvent(new CustomEvent('stage-a2dr1:trial-source', { detail: source }));
      },
    });
  });
}

export async function scheduleControlledReplay(page: Page, plan: readonly ReplayStroke[], generation?: number): Promise<void> {
  await page.evaluate(async ({ plan: strokes, generation: target }) => {
    const trace = window.stageA2dr1ControlledReplay;
    if (!trace) throw new Error('Controlled replay observer unavailable.');
    const dispatches = trace.dispatches;
    const ordinal = target === undefined ? 1 : 2;
    const source = trace.sources[ordinal - 1] ?? await new Promise<PlaybackSource>((resolve, reject) => {
      const deadline = setTimeout(() => {
        window.removeEventListener('stage-a2dr1:trial-source', receive);
        reject(new Error(`Trial BGM source ${ordinal} did not start.`));
      }, 12_000);
      function receive(event: Event) {
        const start = (event as CustomEvent<PlaybackSource>).detail;
        if (start.ordinal !== ordinal) return;
        clearTimeout(deadline);
        window.removeEventListener('stage-a2dr1:trial-source', receive);
        resolve(start);
      }
      window.addEventListener('stage-a2dr1:trial-source', receive);
    });
    if (source.domGenerationAtStart === null || source.lastStampAtMs > source.calledAtMs
        || (target === undefined && source.phaseAtStart !== 'COUNTDOWN')
        || (target !== undefined && (source.phaseAtStart !== 'RESUMING' || source.domGenerationAtStart + 1 !== target))
        || (target === undefined && source.offsetSec !== 0) || (target !== undefined && source.offsetSec <= 0)) {
      throw new Error(`Trial source ${ordinal} did not match the expected playback generation or source offset.`);
    }
    const activeGeneration = target ?? source.domGenerationAtStart;
    const raw = localStorage.getItem('daily-mini-games.game0011.save.v1');
    const setting = raw === null ? null : (JSON.parse(raw) as { settings?: { timingOffsetMs?: number } }).settings?.timingOffsetMs;
    if (setting !== 0) throw new Error('The fixed ideal replay requires the default 0ms timing offset.');
    const originMs = source.stamp.performanceTime + (source.whenSec - source.stamp.contextTime - source.offsetSec) * 1000;
    if (target !== undefined && strokes.some(stroke => stroke.judgeUs <= Math.round(source.offsetSec * 1_000_000))) {
      throw new Error('The planned resume input overlaps the frozen judgement boundary.');
    }
    await new Promise<void>((resolve, reject) => {
      let index = 0;
      function pump() {
        try {
          while (index < strokes.length) {
            const stroke = strokes[index]!;
            const plannedAtMs = originMs + stroke.judgeUs / 1000;
            const pending = plannedAtMs - performance.now();
            if (pending > 0) { setTimeout(pump, pending); return; }
            const screen = document.querySelector<HTMLElement>('main[data-screen]');
            if (screen?.dataset.state === 'ERROR') throw new Error(`Replay stopped at ${stroke.judgeUs}us: ${screen.dataset.error}`);
            if (Number(screen?.dataset.generation) !== activeGeneration || !['PLAYING', 'PREROLL'].includes(screen?.dataset.state ?? '')) {
              throw new Error(`Planned input ${stroke.judgeUs}us had no established playback generation ${activeGeneration}.`);
            }
            const event = new KeyboardEvent(stroke.type, {
              code: `Key${stroke.key.toUpperCase()}`, key: stroke.key, bubbles: true, cancelable: true,
            });
            const actualEventTimeStamp = event.timeStamp;
            Object.defineProperty(event, 'timeStamp', { value: plannedAtMs });
            const invokedAtMs = performance.now();
            window.dispatchEvent(event);
            dispatches.push({ ...stroke, source: source.ordinal, generation: activeGeneration, plannedAtMs,
              actualEventTimeStamp, modeledOccurrenceMs: event.timeStamp, invokedAtMs, returnedAtMs: performance.now() });
            index++;
          }
          resolve();
        } catch (error) { reject(error); }
      }
      pump();
    });
  }, { plan, generation });
}
