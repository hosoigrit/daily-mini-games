import { expectTypeOf, it } from 'vitest';
import type {
  AudioControlPort, AudioEvent, ChartData, ChartMusicContext, CommandResult, CompiledChart,
  CommittedJudgementGroup, Contracts, ConvertedTime, Difficulty, FinalResult, GameCommand, GameUiSnapshot,
  Gen, InputBatch, InputReceipt, LifeState, LifecycleEvent, LockControlPort, Ms, MusicDefinition,
  MusicId, NormalizedInput, PlaybackAnchor, PreparedTrack, RecordUpdate, Result, RenderSnapshot,
  SaveCommitResult, SaveDataV1, ScoreEvent, ScoreState, Sec, StatisticalUs, Tick, Token, TransitionResult,
  Us, ValidationReport, WriterLease, AnimationEvent,
} from '../../src/contracts/interface_contracts';
import type {
  AudioPort, ContentPort, ControllerPort, GameStorePort, InputPort, JudgementPort, PersistencePort,
  PresentationEventsPort, RenderPort, ResultPort, TimePort,
} from '../../src/contracts/ports';

it('IF-01 to IF-20 preserve the specified argument types and return boundaries', () => {
  expectTypeOf<Contracts['renderMusic']>().toEqualTypeOf<(definition: MusicDefinition, token: Token) => Promise<Result<PreparedTrack>>>();
  expectTypeOf<Contracts['getChartMusicContext']>().toEqualTypeOf<(id: MusicId) => Result<ChartMusicContext>>();
  expectTypeOf<Contracts['getPlaybackAnchor']>().toEqualTypeOf<() => Result<PlaybackAnchor>>();
  expectTypeOf<Contracts['convertEventTime']>().toEqualTypeOf<(time: Ms, generation: Gen) => Result<ConvertedTime>>();
  expectTypeOf<Contracts['compileChart']>().toEqualTypeOf<(chart: ChartData, music: ChartMusicContext) => Result<CompiledChart>>();
  expectTypeOf<Contracts['enqueueInput']>().toEqualTypeOf<(input: NormalizedInput) => Result<InputReceipt>>();
  expectTypeOf<Contracts['reduceScore']>().toEqualTypeOf<(state: ScoreState, event: ScoreEvent) => Result<ScoreState>>();
  expectTypeOf<Contracts['reduceLife']>().toEqualTypeOf<(state: LifeState, level: Difficulty, group: CommittedJudgementGroup) => Result<LifeState>>();
  expectTypeOf<Contracts['getRenderSnapshot']>().toEqualTypeOf<() => RenderSnapshot>();
  expectTypeOf<Contracts['publishAnimationEvent']>().toEqualTypeOf<(event: AnimationEvent) => void>();
  expectTypeOf<Contracts['getFinalResult']>().toEqualTypeOf<() => FinalResult | null>();
  expectTypeOf<Contracts['buildRecordUpdate']>().toEqualTypeOf<(save: SaveDataV1, result: FinalResult, recordedAt: string) => Result<RecordUpdate>>();
  expectTypeOf<Contracts['commitResult']>().toEqualTypeOf<(result: FinalResult, lease: WriterLease) => Promise<Result<SaveCommitResult>>>();
  expectTypeOf<Contracts['handleLifecycleEvent']>().toEqualTypeOf<(event: LifecycleEvent) => Promise<Result<TransitionResult>>>();
  expectTypeOf<Contracts['dispatch']>().toEqualTypeOf<(command: GameCommand) => Promise<Result<CommandResult>>>();
  expectTypeOf<Contracts['subscribe']>().toEqualTypeOf<(listener: () => void) => () => void>();
  expectTypeOf<Contracts['getSnapshot']>().toEqualTypeOf<() => GameUiSnapshot>();
  expectTypeOf<Contracts['acquireWriterLock']>().toEqualTypeOf<() => Promise<Result<WriterLease>>>();
  expectTypeOf<Contracts['drainBefore']>().toEqualTypeOf<(watermark: Us) => Result<InputBatch>>();
  expectTypeOf<Contracts['validateContent']>().toEqualTypeOf<
    (kind: 'MUSIC' | 'CHART' | 'FACTORY' | 'TUTORIAL' | 'SAVE', data: unknown) => ValidationReport
  >();
  expectTypeOf<Contracts['subscribeAudioEvents']>().toEqualTypeOf<(listener: (event: AudioEvent) => void) => () => void>();
});

it('the layer ports project the entire public surface and retain the internal lifecycle contracts', () => {
  type LayerPorts = AudioPort & ContentPort & TimePort & InputPort & JudgementPort & RenderPort
    & PresentationEventsPort & ResultPort & PersistencePort & ControllerPort & GameStorePort;
  expectTypeOf<keyof LayerPorts>().toEqualTypeOf<keyof Contracts>();
  expectTypeOf<LayerPorts>().toExtend<Contracts>();
  expectTypeOf<Contracts>().toExtend<LayerPorts>();
  expectTypeOf<AudioControlPort['playAt']>().toEqualTypeOf<
    (track: PreparedTrack, positionUs: Us, startAt: Sec, token: Token) => Result<PlaybackAnchor>
  >();
  expectTypeOf<AudioControlPort['dispose']>().toEqualTypeOf<() => Promise<void>>();
  expectTypeOf<LockControlPort['isCurrent']>().toEqualTypeOf<(lease: WriterLease) => boolean>();
  expectTypeOf<LockControlPort['release']>().toEqualTypeOf<(lease: WriterLease) => Promise<Result<void>>>();
});

it('TC-D3-001 negatives reject mixed units and unbranded time values under strict tsc', () => {
  expectTypeOf<Ms>().not.toExtend<Us>();
  expectTypeOf<Us>().not.toExtend<Sec>();
  expectTypeOf<number>().not.toExtend<Tick>();
  expectTypeOf<StatisticalUs>().not.toExtend<Us>();
  expectTypeOf<Parameters<Contracts['drainBefore']>[0]>().toEqualTypeOf<Us>();
  expectTypeOf<Parameters<Contracts['convertEventTime']>[0]>().toEqualTypeOf<Ms>();
});
