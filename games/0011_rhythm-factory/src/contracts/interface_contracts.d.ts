/** Game #0011 Phase 3 v0.8 (v0.6 supplements approved) — DESIGN ONLY, no runtime implementation. */
export type Brand<T,B extends string> = T & {readonly __brand:B};
export type Us=Brand<number,'us'>; export type Ms=Brand<number,'ms'>; export type Sec=Brand<number,'audio-sec'>; export type Tick=Brand<number,'tick'>; export type Gen=Brand<number,'generation'>;
export type Lane=1|2|3|4; export type Difficulty='EASY'|'NORMAL'|'HARD'; export type Rank='D'|'C'|'B'|'A'|'S'|'SS'; export type Judgement='PERFECT'|'GREAT'|'GOOD'|'MISS';
export type MusicId='music-01'|'music-02'|'music-03'|'music-04'|'music-05'; export type ChartId=`CHART-${'01'|'02'|'03'|'04'|'05'}-${'E'|'N'|'H'}`;
export type TutorialId=`TUT-0${1|2|3|4|5|6}`; export type AchievementId=`ACH-0${1|2|3|4|5|6|7|8}`; export type FactoryId=`FAC-0${1|2|3|4|5}`;
export type ErrorCode=`ERR-0${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'|'09'|10|11|12|13|14|15|16|17|18}`;
export interface GameError {readonly code:ErrorCode;readonly severity:'INFO'|'WARNING'|'ERROR'|'FATAL';readonly messageKey:string;readonly recoverable:boolean;readonly sessionId?:string}
export type Result<T>={readonly ok:true;readonly value:T}|{readonly ok:false;readonly error:GameError};
export interface Token {readonly requestId:string;readonly generation:number;readonly sessionId:string|null}
export interface MusicSection {readonly id:string;readonly type:'INTRO'|'MAIN'|'DEVELOPMENT'|'CLIMAX'|'OUTRO';readonly startBar:number;readonly barCount:number}
export interface MusicMaster {readonly schemaVersion:1;readonly musicId:MusicId;readonly title:string;readonly genre:string;readonly bpm:number;readonly ppq:480;readonly beatsPerBar:4;readonly totalBars:number;readonly key:string;readonly factoryId:FactoryId;readonly sections:readonly MusicSection[];readonly previewStartTick:Tick;readonly previewDurationMs:12000;readonly randomSeed:number}
export interface Envelope {readonly attackMs:number;readonly decayMs:number;readonly sustain:number;readonly releaseMs:number}
export interface OscillatorSpec {readonly wave:'sine'|'triangle'|'square'|'sawtooth';readonly ratio:number;readonly gain:number;readonly detuneCents:number}
export interface Instrument {readonly id:string;readonly oscillators:readonly OscillatorSpec[];readonly noiseGain:number;readonly envelope:Envelope;readonly filter:{readonly type:'lowpass'|'highpass'|'bandpass';readonly frequencyHz:number;readonly q:number}|null;readonly distortion:number;readonly pan:number;readonly gain:number}
export type MusicEvent={readonly id:string;readonly kind:'NOTE';readonly trackId:string;readonly instrumentId:string;readonly startTick:Tick;readonly durationTicks:Tick;readonly midiNote:number;readonly velocity:number}|{readonly id:string;readonly kind:'PERCUSSION';readonly trackId:string;readonly instrumentId:string;readonly startTick:Tick;readonly durationTicks:Tick;readonly velocity:number};
export interface MusicDefinition {readonly master:MusicMaster;readonly instruments:readonly Instrument[];readonly events:readonly MusicEvent[];readonly provenanceId:string}
export interface ChartMusicContext {readonly musicId:MusicId;readonly bpm:number;readonly ppq:480;readonly totalTicks:Tick;readonly durationUs:Us;readonly sections:readonly MusicSection[];readonly musicEventIds:readonly string[]}
export interface PreparedTrack {readonly musicId:MusicId;readonly durationUs:Us;readonly sampleRate:48000;readonly channels:2;readonly preparationId:string}
export interface PlaybackAnchor {readonly playbackId:string;readonly sessionId:string;readonly generation:Gen;readonly startAudioSec:Sec;readonly startSongUs:Us;readonly anchorAudioSec:Sec;readonly anchorPerformanceMs:Ms}
export type AudioEvent=Token & ({readonly kind:'PREPARED';readonly track:PreparedTrack}|{readonly kind:'FAILED';readonly error:GameError}|{readonly kind:'ENDED';readonly playbackId:string;readonly clockGeneration:Gen}|{readonly kind:'INTERRUPTED';readonly playbackId:string;readonly at:Ms}|{readonly kind:'STOPPED';readonly playbackId:string});
export interface ConvertedTime {readonly generation:Gen;readonly songTimeUs:Us;readonly judgeTimeUs:Us}
export interface BaseNote {readonly id:string;readonly sourceMusicEventIds?:readonly string[]}
export type ChartNote=BaseNote & ({readonly type:'TAP';readonly lane:Lane;readonly tick:Tick}|{readonly type:'HOLD';readonly lane:Lane;readonly startTick:Tick;readonly endTick:Tick}|{readonly type:'CHORD';readonly lanes:readonly [Lane,Lane];readonly tick:Tick}|{readonly type:'RAPID';readonly lane:Lane;readonly ticks:readonly Tick[]});
export interface ChartData {readonly schemaVersion:1;readonly chartId:ChartId;readonly musicId:MusicId;readonly difficulty:Difficulty;readonly level:number;readonly notes:readonly ChartNote[]}
export interface ChartEvent {readonly eventId:string;readonly noteId:string;readonly groupId:string;readonly lane:Lane;readonly targetTick:Tick;readonly targetTimeUs:Us;readonly type:'TAP'|'HOLD_START'|'HOLD_END'}
export interface CompiledChart {readonly chartId:ChartId;readonly musicId:MusicId;readonly difficulty:Difficulty;readonly totalJudgements:number;readonly durationUs:Us;readonly events:readonly ChartEvent[];readonly notes:readonly ChartNote[]}
export interface NormalizedInput {readonly eventId:string;readonly sessionId:string;readonly clockGeneration:Gen;readonly inputId:string;readonly lane:Lane;readonly action:'DOWN'|'UP';readonly eventPerformanceMs:Ms;readonly receivedPerformanceMs:Ms;readonly songTimeUs:Us;readonly judgeTimeUs:Us;readonly sequence:number}
export interface InputReceipt {readonly eventId:string;readonly accepted:boolean;readonly reason:'QUEUED'|'DUPLICATE'|'IGNORED_STATE'|'STALE_SESSION'}
export interface InputBatch {readonly events:readonly NormalizedInput[];readonly processedBeforeUs:Us}
export interface JudgementResult {readonly eventId:string;readonly groupId:string;readonly targetTimeUs:Us;readonly judgement:Judgement;readonly errorUs:Us|null}
export interface CommittedJudgementGroup {readonly groupId:string;readonly targetTimeUs:Us;readonly results:readonly JudgementResult[]}
export type ScoreEvent={readonly kind:'GROUP';readonly group:CommittedJudgementGroup}|{readonly kind:'GHOST';readonly eventId:string;readonly judgeTimeUs:Us};
export interface ScoreState {readonly perfect:number;readonly great:number;readonly good:number;readonly miss:number;readonly ghost:number;readonly combo:number;readonly maxCombo:number;readonly totalJudgements:number;readonly committedEventIds:readonly string[];readonly committedGhostIds:readonly string[]}
export interface LifeState {readonly currentUnits:number;readonly maxUnits:200}
export type GameState='READY'|'INITIALIZING'|'COUNTDOWN'|'PREROLL'|'PLAYING'|'PAUSING'|'PAUSED'|'REHOLD_WAIT'|'RESUMING'|'FINALIZING'|'CLEAR'|'FAILED'|'ABORTED'|'ERROR';
export type SaveStatus='IDLE'|'PENDING_SAVE'|'SAVING'|'SAVED'|'SAVE_ERROR'|'DISCARDED';
export interface RenderNote {readonly eventId:string;readonly noteId:string;readonly lane:Lane;readonly targetUs:Us;readonly endUs:Us|null;readonly type:ChartNote['type'];readonly state:'PENDING'|'RESOLVED'|'COMMITTED';readonly judgement:Judgement|null}
export interface RenderSnapshot {readonly sessionId:string|null;readonly generation:Gen|null;readonly songTimeUs:Us;readonly judgeTimeUs:Us;readonly durationUs:Us;readonly state:GameState;readonly notes:readonly RenderNote[];readonly factoryId:FactoryId|null;readonly activeHoldLanes:readonly Lane[];readonly pressedLanes:readonly Lane[];readonly noteSpeed:number;readonly effectQuality:'NORMAL'|'LIGHT';readonly progress:number}
export type AnimationId=`AN-${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'|'09'|10|11}`;
export interface AnimationEvent {readonly eventId:string;readonly sessionId:string;readonly generation:Gen;readonly animationId:AnimationId;readonly lanes:readonly Lane[];readonly songTimeUs:Us;readonly provisional:boolean;readonly rank:Rank|null}
export interface JudgementCounts {readonly perfect:number;readonly great:number;readonly good:number;readonly miss:number;readonly unplayed:number;readonly ghost:number}
export interface FinalResult {readonly sessionId:string;readonly musicId:MusicId;readonly chartId:ChartId;readonly difficulty:Difficulty;readonly outcome:'CLEAR'|'FAILED';readonly score:number;readonly rank:Rank;readonly counts:JudgementCounts;readonly totalJudgements:number;readonly maxCombo:number;readonly remainingLifeUnits:number;readonly endJudgeTimeUs:Us;readonly durationUs:Us}
export interface GameSettings {readonly musicVolume:number;readonly sfxVolume:number;readonly noteSpeed:number;readonly timingOffsetMs:number;readonly showFastSlow:boolean;readonly effectQuality:'NORMAL'|'LIGHT';readonly vibrationEnabled:boolean;readonly keyBindings:readonly [string,string,string,string]}
export interface ProgressData {readonly unlockedMusicIds:readonly MusicId[];readonly completedTutorialIds:readonly TutorialId[]}
export interface ResultSummary {readonly sessionId:string;readonly score:number;readonly rank:Rank;readonly counts:JudgementCounts;readonly maxCombo:number;readonly remainingLifeUnits:number}
export interface ClearRecord {readonly bestScore:number;readonly bestRank:Rank;readonly bestCombo:number;readonly clearCount:number;readonly fullComboAchieved:boolean;readonly allPerfectAchieved:boolean;readonly bestScoreResult:ResultSummary}
export interface FailedRecord {readonly bestScore:number;readonly bestProgressPermille:number;readonly bestCombo:number;readonly failureCount:number;readonly latestResult:ResultSummary;readonly latestEndJudgeTimeUs:Us}
export interface ChartRecord {readonly clear:ClearRecord|null;readonly failed:FailedRecord|null}
export interface CollectionRecord {readonly musicId:MusicId;readonly chartId:ChartId;readonly bestQuality:Rank}
export interface AchievementRecord {readonly achievementId:AchievementId;readonly unlockedAt:string}
export interface SaveReceipt {readonly sessionId:string;readonly saveEpoch:string;readonly revision:number;readonly resultDigest:string}
export interface SaveDataV1 {readonly schemaVersion:1;readonly saveEpoch:string;readonly revision:number;readonly settings:GameSettings;readonly progress:ProgressData;readonly records:Readonly<Partial<Record<ChartId,ChartRecord>>>;readonly collection:Readonly<Partial<Record<ChartId,CollectionRecord>>>;readonly achievements:readonly AchievementRecord[];readonly commitReceipt:SaveReceipt|null}
export interface RecordUpdate {readonly data:SaveDataV1;readonly newAchievements:readonly AchievementId[];readonly newlyUnlocked:readonly MusicId[]}
export interface WriterLease {readonly ownerId:string;readonly generation:number}
export interface SaveCommitResult {readonly status:'SAVED'|'ALREADY_COMMITTED';readonly receipt:SaveReceipt}
export interface PendingCommit {readonly result:FinalResult;readonly saveEpoch:string;readonly baseRevision:number;readonly digest:string;readonly leaseGeneration:number;readonly recordedAt:string}
export interface GameUiSnapshot {readonly sessionId:string|null;readonly revision:number;readonly state:GameState;readonly score:number;readonly combo:number;readonly maxCombo:number;readonly lifeUnits:number;readonly saveStatus:SaveStatus;readonly reholdLanes:readonly Lane[];readonly error:GameError|null}
export interface LifecycleEvent {readonly kind:'HIDDEN'|'VISIBLE'|'BLUR'|'PAGEHIDE'|'PAGESHOW'|'AUDIO_INTERRUPTED'|'POINTER_CANCEL'|'RESIZE'|'LOCK_LOST';readonly atPerformanceMs:Ms;readonly sessionId:string|null;readonly generation:Gen|null}
export type GameCommand={readonly requestId:string;readonly sessionId:string|null}&({readonly kind:'SELECT_TRACK'|'START_PREVIEW';readonly musicId:MusicId}|{readonly kind:'SELECT_DIFFICULTY';readonly difficulty:Difficulty}|{readonly kind:'START_GAME'|'STOP_PREVIEW'|'PAUSE_GAME'|'RESUME_GAME'|'RETRY_GAME'|'ABORT_GAME'|'RETRY_SAVE'|'RESET_SETTINGS'|'START_CALIBRATION'|'STOP_CALIBRATION'|'SKIP_TUTORIAL'}|{readonly kind:'APPLY_SETTINGS';readonly settings:GameSettings}|{readonly kind:'DISCARD_RESULT'|'RESET_PROGRESS';readonly confirmed:true}|{readonly kind:'START_TUTORIAL';readonly tutorialId:TutorialId}|{readonly kind:'APPLY_CALIBRATION';readonly offsetMs:number;readonly confirmed:true});
export interface TransitionResult {readonly previous:GameState;readonly current:GameState;readonly sessionId:string|null}
export interface CommandResult {readonly requestId:string;readonly accepted:boolean;readonly state:GameState}
export interface ValidationIssue {readonly code:string;readonly path:string;readonly message:string}
export interface ValidationReport {readonly valid:boolean;readonly issues:readonly ValidationIssue[]}
export interface Contracts {
  /** IF-01 */ renderMusic(definition:MusicDefinition,token:Token):Promise<Result<PreparedTrack>>;
  /** IF-02 */ getChartMusicContext(musicId:MusicId):Result<ChartMusicContext>;
  /** IF-03 */ getPlaybackAnchor():Result<PlaybackAnchor>;
  /** IF-04 */ convertEventTime(time:Ms,generation:Gen):Result<ConvertedTime>;
  /** IF-05 */ compileChart(chart:ChartData,music:ChartMusicContext):Result<CompiledChart>;
  /** IF-06 */ enqueueInput(input:NormalizedInput):Result<InputReceipt>;
  /** IF-07 */ reduceScore(state:ScoreState,event:ScoreEvent):Result<ScoreState>;
  /** IF-08 */ reduceLife(state:LifeState,difficulty:Difficulty,group:CommittedJudgementGroup):Result<LifeState>;
  /** IF-09 */ getRenderSnapshot():RenderSnapshot;
  /** IF-10 */ publishAnimationEvent(event:AnimationEvent):void;
  /** IF-11 */ getFinalResult():FinalResult|null;
  /** IF-12 */ buildRecordUpdate(save:SaveDataV1,result:FinalResult,recordedAt:string):Result<RecordUpdate>;
  /** IF-13 */ commitResult(result:FinalResult,lease:WriterLease):Promise<Result<SaveCommitResult>>;
  /** IF-14 */ handleLifecycleEvent(event:LifecycleEvent):Promise<Result<TransitionResult>>;
  /** IF-15 */ dispatch(command:GameCommand):Promise<Result<CommandResult>>;
  /** IF-16 */ subscribe(listener:()=>void):()=>void; getSnapshot():GameUiSnapshot;
  /** IF-17 */ acquireWriterLock():Promise<Result<WriterLease>>;
  /** IF-18 */ drainBefore(watermark:Us):Result<InputBatch>;
  /** IF-19 */ validateContent(kind:'MUSIC'|'CHART'|'FACTORY'|'TUTORIAL'|'SAVE',data:unknown):ValidationReport;
  /** IF-20 */ subscribeAudioEvents(listener:(event:AudioEvent)=>void):()=>void;
}
/** Internal ports complement the 20 cross-module contracts; not extra public features. */
export interface AudioControlPort {playAt(track:PreparedTrack,positionUs:Us,startAt:Sec,token:Token):Result<PlaybackAnchor>;stop(token:Token):Result<void>;preview(track:PreparedTrack,startUs:Us,durationUs:Us,token:Token):Result<void>;setVolume(channel:'MUSIC'|'SFX',value:number):Result<void>;dispose():Promise<void>}
export interface LockControlPort {isCurrent(lease:WriterLease):boolean;release(lease:WriterLease):Promise<Result<void>>}

/** v0.6 design supplement: explicit state/data shapes, no implementation. */
export type HoldState='WAITING'|'HOLDING'|'SUSPENDED'|'REHOLD_WAIT'|'BROKEN'|'END_RESOLVED'|'COMPLETED'|'FAILED';
export interface HoldRuntimeState {readonly noteId:string;readonly lane:Lane;readonly startEventId:string;readonly endEventId:string;readonly startTimeUs:Us;readonly endTimeUs:Us;readonly state:HoldState;readonly activeInputId:string|null;readonly startJudgement:Judgement|null;readonly endJudgement:Judgement|null}
export interface FactoryMachine {readonly lane:Lane;readonly label:string;readonly bodyAsset:string;readonly movingPartAsset:string;readonly indicatorAsset:string;readonly anchor:readonly [number,number]}
export interface FactoryDefinition {readonly schemaVersion:1;readonly factoryId:FactoryId;readonly musicId:MusicId;readonly title:string;readonly productName:string;readonly backgroundAsset:string;readonly machines:readonly [FactoryMachine,FactoryMachine,FactoryMachine,FactoryMachine];readonly productQualityAssets:Readonly<Record<Rank,readonly string[]>>;readonly provenanceId:string}
export interface TutorialDefinition {readonly schemaVersion:1;readonly tutorialId:TutorialId;readonly title:string;readonly instruction:string;readonly bpm:number;readonly ppq:480;readonly durationUs:Us;readonly notes:readonly ChartNote[]}
/** Derived statistics can have half/quarter microseconds; not a game clock. */
export type StatisticalUs=Brand<number,'statistical-us'>;
export interface CalibrationSample {readonly beatIndex:number;readonly errorUs:Us}
export type CalibrationResult={readonly kind:'PROPOSED';readonly samples:readonly CalibrationSample[];readonly medianUs:StatisticalUs;readonly madUs:StatisticalUs;readonly proposedOffsetMs:number}|{readonly kind:'RETRY';readonly reason:'INSUFFICIENT'|'SPREAD'|'OUT_OF_RANGE'|'INTERRUPTED'};
export interface PauseBoundary {readonly generation:Gen;readonly songTimeUs:Us;readonly judgeTimeUs:Us;readonly atPerformanceMs:Ms;readonly processedBeforeUs:Us;readonly resumeState:'COUNTDOWN'|'PREROLL'|'PLAYING'|'FINALIZING'}
