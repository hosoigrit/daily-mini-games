import type { FixtureId } from './model';

export interface BuildMetadata {
  qaHarnessVersion: string;
  qaHarnessCommit: string;
  productImplementationCommit: string;
  baselineCommit: string;
  fixtureHashes: Record<FixtureId, string>;
}

declare const __QA_METADATA__: BuildMetadata;

export const buildMetadata = __QA_METADATA__;
