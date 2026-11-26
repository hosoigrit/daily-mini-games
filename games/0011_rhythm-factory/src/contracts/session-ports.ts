import type {
  AudioEvent, ConvertedTime, GameSettings, Gen, Ms, MusicDefinition, PlaybackAnchor, PreparedTrack, Result, Token, Us,
} from './interface_contracts';
import type { TimePort } from './ports';

export interface SessionClockFactory {
  (anchor: PlaybackAnchor, offsetUs: Us): Result<TimePort & {
    observe(sample: { readonly contextTime: number; readonly performanceTime: number } | undefined): Result<unknown>;
  }>;
}

export interface SessionClockContext {
  readonly sessionId: string;
  readonly clockGeneration: Gen;
  readonly clock: TimePort;
}

interface SessionPlaybackPosition {
  readonly token: Token & { readonly sessionId: string; readonly generation: Gen };
  readonly songTimeUs: Us;
  readonly offsetUs: Us;
  readonly atMs: Ms;
}

export type SessionPlaybackRequest = SessionPlaybackPosition & (
  { readonly playBgm: true; readonly track: PreparedTrack }
  | { readonly playBgm: false; readonly calibrationBeatsUs?: readonly Us[] }
);

export interface SessionAudioPort {
  prepare(definition: MusicDefinition, token: Token): Promise<Result<PreparedTrack>>;
  enable(): Promise<Result<void>>;
  anchorAvailable(): boolean;
  start(request: SessionPlaybackRequest): Result<PlaybackAnchor>;
  stop(token: Token): Result<void>;
  preview(track: PreparedTrack, startUs: Us, durationUs: Us, token: Token): Result<void>;
  convert(atMs: Ms, generation: Gen): Result<ConvertedTime>;
  startPerformanceMs(generation: Gen): Ms | null;
  contextAt(atMs: Ms): SessionClockContext | null;
  monitor(atMs: Ms): Result<void>;
  applySettings(settings: GameSettings): void;
  subscribeAudioEvents(listener: (event: AudioEvent) => void): () => void;
  forgetSession(sessionId: string): void;
  forgetGeneration(generation: Gen): void;
}
