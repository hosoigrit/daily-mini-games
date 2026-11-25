import type { Contracts } from './interface_contracts';

export type AudioPort = Pick<Contracts, 'renderMusic' | 'getPlaybackAnchor' | 'subscribeAudioEvents'>;
export type ContentPort = Pick<Contracts, 'getChartMusicContext' | 'compileChart' | 'validateContent'>;
export type TimePort = Pick<Contracts, 'convertEventTime'>;
export type InputPort = Pick<Contracts, 'enqueueInput' | 'drainBefore'>;
export type JudgementPort = Pick<Contracts, 'reduceScore' | 'reduceLife'>;
export type RenderPort = Pick<Contracts, 'getRenderSnapshot'>;
export type PresentationEventsPort = Pick<Contracts, 'publishAnimationEvent'>;
export type ResultPort = Pick<Contracts, 'getFinalResult'>;
export type PersistencePort = Pick<Contracts, 'buildRecordUpdate' | 'commitResult' | 'acquireWriterLock'>;
export type ControllerPort = Pick<Contracts, 'handleLifecycleEvent' | 'dispatch'>;
export type GameStorePort = Pick<Contracts, 'subscribe' | 'getSnapshot'>;
