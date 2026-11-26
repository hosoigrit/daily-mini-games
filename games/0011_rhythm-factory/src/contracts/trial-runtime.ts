import type {
  CalibrationResult, CommandResult, FinalResult, GameCommand, GameSettings, GameUiSnapshot, Gen, Judgement,
  Lane, Result, SaveDataV1,
} from './interface_contracts';

export type TrialScreen = 'TITLE' | 'MENU' | 'MUSIC_SELECT' | 'TUTORIAL' | 'COLLECTION' | 'SETTINGS'
  | 'CALIBRATION' | 'GAME' | 'PAUSE' | 'RESULT';
type RemoveEnvelope<T> = T extends GameCommand ? Omit<T, 'requestId' | 'sessionId'> : never;
export type TrialCommand = RemoveEnvelope<GameCommand>;
export type TrialLaneButtons = readonly [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];

export interface TrialJudgement {
  readonly id: string;
  readonly label: Judgement;
  readonly timing: 'FAST' | 'SLOW' | null;
}

export interface TrialSnapshot {
  readonly screen: TrialScreen;
  readonly ui: GameUiSnapshot;
  readonly prepared: boolean;
  readonly preview: boolean;
  readonly writer: 'OWNED' | 'UNOWNED' | 'UNSUPPORTED' | 'LOST';
  readonly pending: boolean;
  readonly settings: GameSettings | null;
  readonly mode: 'FORMAL' | 'PRACTICE' | null;
  readonly result: FinalResult | null;
  readonly calibration: CalibrationResult | null;
  readonly calibrationBeat?: number | null;
  readonly generation: Gen | null;
  readonly progress: number;
  readonly countdownSeconds: number | null;
  readonly reheldLanes: readonly Lane[];
  readonly judgements: readonly TrialJudgement[];
  readonly save: SaveDataV1 | null;
}

export interface TrialRuntime {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TrialSnapshot;
  dispatch(command: TrialCommand): Promise<Result<CommandResult>>;
  navigate(screen: TrialScreen): boolean;
  prepareTutorial(): void;
  prepareAudio(): Promise<Result<void>>;
  mountPlayfield(canvas: HTMLCanvasElement, buttons: TrialLaneButtons, onPhysical?: (lanes: readonly Lane[]) => void): () => void;
  mountCalibration(button: HTMLButtonElement, onPhysical?: (lanes: readonly Lane[]) => void): () => void;
}
