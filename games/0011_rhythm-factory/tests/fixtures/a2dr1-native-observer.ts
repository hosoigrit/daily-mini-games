import type { Page } from '@playwright/test';

interface NativeTimestampRead {
  readonly readId: number;
  readonly contextId: number;
  readonly calledAtMs: number;
  readonly returnedAtMs: number;
  readonly contextTime: number | null;
  readonly performanceTime: number | null;
  readonly currentTime: number | null;
  readonly state: AudioContextState;
  readonly nonfiniteFields: readonly string[];
  readonly nativeError: string | null;
}

export interface NativeSourceStart {
  readonly sourceId: number;
  readonly contextId: number;
  readonly scope: 'full-track-bgm' | 'other-online-buffer';
  readonly calledAtMs: number;
  readonly finishedAtMs: number;
  readonly whenSec: number | null;
  readonly offsetSec: number | null;
  readonly durationArgSec: number | null;
  readonly bufferDurationSec: number | null;
  readonly anchorReadId: number | null;
  readonly anchorContextTime: number | null;
  readonly anchorPerformanceTime: number | null;
}

interface ProductAudioObservation {
  readonly atMs: number;
  readonly generation: number;
  readonly rawDifferenceUs: number | null;
  readonly differenceUs?: number;
  readonly error?: string;
  readonly errorCode?: string;
}

interface MonitorObservation extends ProductAudioObservation {
  readonly ordinal: number;
  readonly intervalMs: number | null;
  readonly contextId: number | null;
  readonly sourceId: number | null;
  readonly anchorReadId: number | null;
  readonly candidateNativeReadId: number | null;
  readonly nativeReadId: number | null;
  readonly correlation: 'fresh-same-context' | 'unconfirmed-native-read' | 'no-fresh-native-read' | 'no-observed-bgm-anchor';
}

export interface NativeAudioTrace {
  readonly condition: 'native-a2dr1-pass-through';
  readonly timeOriginMs: number;
  readonly timestampReads: NativeTimestampRead[];
  readonly sources: NativeSourceStart[];
  readonly monitor: MonitorObservation[];
  readonly lifecycle: { phase: 'stop' | 'ended'; sourceId: number; atMs: number; whenSec: number | null }[];
  readonly activeSourceIds: number[];
  readonly frameIdentities: { sessionId: string | null; generation: number | null; atMs: number }[];
  readonly resources: Record<string, number>[];
  readonly missingHooks: string[];
  readonly observerErrors: string[];
  readonly productPlaybackId: null;
}

/** Test-page sideband only. All original browser calls, results, exceptions and cadence are retained. */
export async function installNativeAudioObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: NativeAudioTrace = {
      condition: 'native-a2dr1-pass-through', timeOriginMs: performance.timeOrigin,
      timestampReads: [], sources: [], monitor: [], lifecycle: [], activeSourceIds: [],
      frameIdentities: [], resources: [], missingHooks: [], observerErrors: [], productPlaybackId: null,
    };
    Object.defineProperty(window, 'stageA2dr1NativeAudio', { value: trace });
    const contextIds = new WeakMap<AudioContext, number>();
    const latestReads = new Map<number, NativeTimestampRead>();
    const activeSources = new WeakMap<AudioBufferSourceNode, NativeSourceStart>();
    const sourceByGeneration = new Map<number, NativeSourceStart>();
    const boundBgmSources = new Set<number>();
    const lastMonitorByGeneration = new Map<number, MonitorObservation>();
    let nextContextId = 0;
    let lastConsumedReadId = 0;
    let newestBgm: NativeSourceStart | null = null;

    function getContextId(context: AudioContext): number {
      const id = contextIds.get(context) ?? ++nextContextId;
      contextIds.set(context, id);
      return id;
    }

    function attempt(label: string, observe: () => void): void {
      try { observe(); } catch { trace.observerErrors.push(label); }
    }

    function hook<T extends object, R>(prototype: T, method: string, implementation:
      (native: (...args: unknown[]) => R, receiver: T, args: unknown[]) => R) {
      attempt(`install:${method}`, () => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        if (typeof descriptor?.value !== 'function') {
          trace.missingHooks.push(method);
          return;
        }
        const native = descriptor.value as (...args: unknown[]) => R;
        Object.defineProperty(prototype, method, {
          ...descriptor,
          value(this: T, ...args: unknown[]) { return implementation(native, this, args); },
        });
      });
    }

    const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const errorName = (error: unknown): string => error instanceof Error ? error.name : 'unavailable';

    function recordStamp(context: AudioContext, calledAtMs: number, stamp: AudioTimestamp | undefined, nativeError: string | null) {
      const returnedAtMs = performance.now();
      attempt('record:getOutputTimestamp', () => {
        const contextId = getContextId(context);
        const currentTime = context.currentTime;
        const raw = { contextTime: stamp?.contextTime, performanceTime: stamp?.performanceTime, currentTime };
        const read: NativeTimestampRead = {
          contextId, readId: trace.timestampReads.length + 1, calledAtMs, returnedAtMs,
          contextTime: finite(raw.contextTime), performanceTime: finite(raw.performanceTime), currentTime: finite(currentTime),
          state: context.state, nativeError,
          nonfiniteFields: Object.entries(raw).filter(([, value]) => typeof value === 'number' && !Number.isFinite(value))
            .map(([name, value]) => `${name}:${String(value)}`),
        };
        trace.timestampReads.push(read);
        latestReads.set(contextId, read);
      });
    }

    hook<AudioContext, AudioTimestamp>(AudioContext.prototype, 'getOutputTimestamp', (native, context, args) => {
      const calledAtMs = performance.now();
      let stamp: AudioTimestamp;
      try { stamp = Reflect.apply(native, context, args); } catch (error) {
        recordStamp(context, calledAtMs, undefined, errorName(error));
        throw error;
      }
      recordStamp(context, calledAtMs, stamp, null);
      return stamp;
    });

    hook<AudioBufferSourceNode, void>(AudioBufferSourceNode.prototype, 'start', (native, source, args) => {
      // Offline synthesis stays outside the traced starts and has no diagnostic reads.
      const context = source.context;
      if (!(context instanceof AudioContext)) return Reflect.apply(native, source, args);
      const calledAtMs = performance.now();
      const anchor = latestReads.get(getContextId(context));
      const result = Reflect.apply(native, source, args);
      attempt('record:start', () => {
        const bufferDurationSec = source.buffer?.duration ?? null;
        const scope = bufferDurationSec === 24 && args.length < 3 ? 'full-track-bgm' : 'other-online-buffer';
        const detail: NativeSourceStart = {
          sourceId: trace.sources.length + 1, contextId: getContextId(context), scope, calledAtMs,
          finishedAtMs: performance.now(), whenSec: finite(args[0]), offsetSec: finite(args[1]),
          durationArgSec: finite(args[2]), bufferDurationSec,
          anchorReadId: scope === 'full-track-bgm' ? anchor?.readId ?? null : null,
          anchorContextTime: scope === 'full-track-bgm' ? anchor?.contextTime ?? null : null,
          anchorPerformanceTime: scope === 'full-track-bgm' ? anchor?.performanceTime ?? null : null,
        };
        trace.sources.push(detail);
        trace.activeSourceIds.push(detail.sourceId);
        activeSources.set(source, detail);
        if (scope === 'full-track-bgm') newestBgm = detail;
        source.addEventListener('ended', () => {
          trace.lifecycle.push({ phase: 'ended', sourceId: detail.sourceId, atMs: performance.now(), whenSec: null });
          const index = trace.activeSourceIds.indexOf(detail.sourceId);
          if (index >= 0) trace.activeSourceIds.splice(index, 1);
        }, { once: true });
      });
      return result;
    });

    hook<AudioScheduledSourceNode, void>(AudioScheduledSourceNode.prototype, 'stop', (native, source, args) => {
      const result = Reflect.apply(native, source, args);
      attempt('record:stop', () => {
        if (!(source instanceof AudioBufferSourceNode)) return;
        const detail = activeSources.get(source);
        if (detail) trace.lifecycle.push({ phase: 'stop', sourceId: detail.sourceId, atMs: performance.now(), whenSec: finite(args[0]) });
      });
      return result;
    });

    window.addEventListener('stage-a2d:audio', event => {
      attempt('record:monitor', () => {
        const detail = (event as CustomEvent<ProductAudioObservation>).detail;
        const previous = lastMonitorByGeneration.get(detail.generation);
        let source = sourceByGeneration.get(detail.generation);
        if (!source && newestBgm && !boundBgmSources.has(newestBgm.sourceId)) {
          source = newestBgm;
          sourceByGeneration.set(detail.generation, source);
          boundBgmSources.add(source.sourceId);
        }
        const lastRead = source && latestReads.get(source.contextId);
        const anchorReadId = source?.anchorReadId ?? null;
        const candidate = anchorReadId !== null && lastRead && lastRead.readId > Math.max(lastConsumedReadId, anchorReadId)
          && lastRead.returnedAtMs <= detail.atMs ? lastRead : null;
        if (candidate) lastConsumedReadId = candidate.readId;
        const usableCandidate = !!candidate && candidate.contextTime !== null && candidate.contextTime > 0
          && candidate.performanceTime !== null && candidate.performanceTime > 0;
        // A readiness check can also read the native clock. A usable readiness
        // sample cannot explain a monitor diagnostic with no usable stamp.
        const paired = candidate && usableCandidate === (detail.rawDifferenceUs !== null) ? candidate : null;
        const item: MonitorObservation = {
          ...detail, ordinal: (previous?.ordinal ?? 0) + 1, intervalMs: previous ? detail.atMs - previous.atMs : null,
          contextId: source?.contextId ?? null, sourceId: source?.sourceId ?? null, anchorReadId, candidateNativeReadId: candidate?.readId ?? null,
          nativeReadId: paired?.readId ?? null,
          correlation: paired ? 'fresh-same-context' : candidate ? 'unconfirmed-native-read'
            : source && anchorReadId !== null ? 'no-fresh-native-read' : 'no-observed-bgm-anchor',
        };
        trace.monitor.push(item);
        lastMonitorByGeneration.set(detail.generation, item);
      });
    });
    window.addEventListener('stage-a2d:frame', event => {
      const { sessionId, generation, atMs } = (event as CustomEvent<NativeAudioTrace['frameIdentities'][number]>).detail;
      const previous = trace.frameIdentities.at(-1);
      if (!previous || previous.sessionId !== sessionId || previous.generation !== generation) {
        trace.frameIdentities.push({ sessionId, generation, atMs });
      }
    });
    window.addEventListener('stage-a2d:resources', event => {
      trace.resources.push((event as CustomEvent<NativeAudioTrace['resources'][number]>).detail);
    });
  });
}
