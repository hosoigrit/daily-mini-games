import assert from 'node:assert/strict';
import { csv } from './verify-h01.mjs';

const tracePath = '02_reference/Game0012_Requirement_Test_Trace_v0.3_DRAFT.csv';
const requirements = new Map(csv(tracePath).map(row => [row.requirementId, row]));
const approved = new Map();
for (const [id, row] of requirements) {
  for (const testId of row.plannedTestIds.split(',')) {
    approved.set(testId, [...(approved.get(testId) ?? []), id]);
  }
}

// Evidence links for cases the approved trace does not enumerate individually.
// They relate existing checks to existing FR rows and carry no new requirements.
const supplementalByFR = {
  'FR-001': 'DAT-01',
  'FR-004': 'REC-06 MEC-01 MEC-02 INP-17',
  'FR-007': 'GC-02 GC-04 GC-05 PHS-03 BAL-01 BAL-05',
  'FR-008': 'GC-02 GC-04 GC-05 MEC-07 UI-05 BAL-02 BAL-04',
  'FR-011': 'GC-02 GC-04 GC-05 MEC-03 MEC-05 MEC-17 INP-18',
  'FR-012': 'BAL-06 UI-08',
  'FR-013': 'UI-07',
  'FR-014': 'MEC-11 PHS-12',
  'FR-015': 'PHS-04',
  'FR-016': 'PHS-04 PHS-06',
  'FR-017': 'REC-07 PHS-06 PHS-09 PHS-10 UI-12',
  'FR-018': 'GHO-07 SCO-04',
  'FR-020': 'INP-14 INP-19 INP-20 TIM-01 TIM-04 TIM-05 TIM-06 TIM-07 TIM-10 TIM-12 TIM-13 TIM-14 PSE-02 PSE-03 UI-09',
  'FR-021': 'INP-11 INP-20',
  'FR-022': 'INP-01 INP-02 INP-10 DEV-02 DEV-03',
  'FR-023': 'SCO-01 SCO-02 SCO-03 SCO-04 SCO-08 BAL-03 BAL-07 UI-12',
  'FR-024': 'SAV-01 SAV-05 SAV-06 SAV-07 SAV-08 SAV-09 SAV-10 SAV-11 SAV-12 SAV-13 SAV-14 SAV-15 UI-16 UI-18',
  'FR-026': 'MEC-15',
  'FR-027': 'PHS-09',
  'FR-028': 'INP-06 INP-08 INP-09 INP-10',
  'FR-031': 'DAT-01 DAT-02 DAT-03 DAT-04 DAT-06',
  'FR-032': 'PHS-10 PHS-11 INP-16 TIM-01 TIM-02 TIM-03 TIM-04 TIM-05 TIM-13 TIM-14 TIM-15 TIM-16 TIM-17',
  'FR-033': 'INP-19',
  'FR-034': 'PSE-02 PSE-03',
  'FR-035': 'MEC-15',
  'FR-036': 'INP-01 INP-02 INP-03 INP-06 INP-08 INP-09 INP-10 INP-11 INP-17 INP-18'
};
const linked = new Map();
for (const [id, tests] of Object.entries(supplementalByFR)) {
  assert(requirements.has(id));
  for (const testId of tests.split(' ')) {
    assert(!approved.has(testId), testId + ' already has an approved trace link');
    linked.set(testId, [...(linked.get(testId) ?? []), id]);
  }
}

const browserPlans = {
  'UI-01': ['Fresh local game page', 'Open game menu', 'Title and six stage choices are present'],
  'UI-02': ['Stage 1 available, later stages locked', 'Clear GC-01 and return to the menu', 'Stage 2 unlocks and Stage 3 stays locked'],
  'UI-03': ['Stage 1 ready', 'Start recording and advance one tick', 'Recording shows 0/16 and then 1/16'],
  'UI-04': ['Stage 1 ready', 'Record two right moves and finish', 'Guide and timeline show 14 padding ticks'],
  'UI-05': ['Stage 1 with a two-tick recording', 'Start replay at the overlap position', 'Player and ghost both render with distinct styling'],
  'UI-06': ['Stage 1 recording, door D closed', 'Move right twice to switch a', 'The a-to-D explanation changes from closed to open'],
  'UI-07': ['Stage 3 ready', 'Play GC-03 through tick 4', 'Synchronization notice appears and latch L opens'],
  'UI-08': ['Stage 1 ready', 'Record RR.R, replay RRRRR', 'Door shows HELD_OPEN at tick 4 and CLOSED after exit'],
  'UI-09': ['Stage 1 recording at tick 1', 'Pause for 10 seconds, resume, advance a tick', 'Tick holds at 1 while paused and becomes 2 on resume'],
  'UI-10': ['Stage 1 replay at tick 2', 'Use Retry, then Re-record', 'Retry retains the recording; Re-record starts at tick 0'],
  'UI-11': ['Stage 5 ready', 'Play the GC-06 route through tick 16', 'Solo-phase and ghost-disappearance guidance appears'],
  'UI-12': ['Stage 1 ready', 'Clear GC-01 and choose the next stage', 'Three stars and eight moves are displayed; Stage 2 opens'],
  'UI-13': ['Stage 1 recording with empty FIFO', 'Press right, up and down before next tick', 'Queue-full notice appears and the first reservation moves right'],
  'UI-14': ['Stage 6 at x=1,y=3, 320px touch viewport', 'Inspect layout and tap right, then advance one tick', 'Board and controls fit, targets are at least 44px and player moves to (2,3)'],
  'UI-15': ['Stage 1 recording', 'Press D and ArrowRight on successive ticks', 'Player moves to (2,1) and then (3,1)'],
  'UI-16': ['Stage 1 with storage writes blocked', 'Clear GC-01', 'Temporary-progress warning is shown and existing storage is unchanged'],
  'BROWSER-LIVE-CLOCK': ['Stage 1 recording with real browser timers', 'Press right, then pause and wait 600ms', 'Player moves right and the logical tick does not advance during pause'],
  'T1-H01': ['Fixed E1 golden recording coordinates, maps, and record event supplement', 'Independently recompute mechanism deltas for each executed frame', 'Ordered events agree for 41 frames; 11 changed and 30 unchanged, with 71 padding frames excluded']
};

export const correctionIds = [
  ...['USER', 'HIDDEN', 'PERFORMANCE', 'COMBINED', 'RESUME-PENDING', 'USER-CHROMIUM'].map(type => 'R01-F01-' + type),
  ...['REJECTED', 'ACCEPTED'].flatMap(kind => ['NODE', 'CHROMIUM'].map(engine => 'R01-F02-' + kind + '-CANCEL-' + engine))
];

for (const id of correctionIds) {
  if (id.startsWith('R01-F01-')) {
    browserPlans[id] = [
      'Stage 1 with a retained ghost recording, replay at tick 1',
      'Pause for ' + id.slice('R01-F01-'.length) + ', issue phase-changing commands, then explicitly resume',
      'State, recording, tick and pause status are preserved during refusal; after explicit resume normal Retry and Re-record work'
    ];
  } else {
    const rejected = id.includes('REJECTED');
    browserPlans[id] = [
      'Stage 1 with an accepted and released RIGHT reservation tied to the reused pointer',
      rejected
        ? 'Queue UP, press LEFT with the same pointer while the FIFO is full, cancel LEFT, advance ticks'
        : 'Accept and cancel a current LEFT press from the same pointer, then consume the queue',
      rejected
        ? 'RIGHT and UP execute in order, followed by WAIT; LEFT never moves'
        : 'Only the current LEFT reservation is removed; the earlier RIGHT still executes'
    ];
  }
}

function requirementLink(testId) {
  const corresponding = approved.get(testId);
  let ids = corresponding ?? linked.get(testId);
  if (!ids && testId.startsWith('BROWSER-GC-')) ids = requirementLink(testId.slice(8)).ids;
  if (testId === 'BROWSER-SAV-19') ids = approved.get('SAV-19');
  if (testId === 'BROWSER-LIVE-CLOCK') ids = ['FR-020', 'FR-032'];
  if (testId === 'T1-H01') ids = ['FR-004', 'FR-031', 'FR-032'];
  if (testId.startsWith('R01-F01-')) {
    ids = ['FR-018', 'FR-019', 'FR-020'];
    if (/HIDDEN|COMBINED|RESUME-PENDING/.test(testId)) ids.push('FR-034');
  }
  if (testId.startsWith('R01-F02-')) ids = ['FR-022', 'FR-028', 'FR-036'];
  assert(ids?.length, 'Missing requirement link for ' + testId);
  return {
    ids,
    source: 'handoffs/game-0012/e1/' + tracePath,
    kind: corresponding ? 'APPROVED_TRACE' : 'SUPPLEMENTARY_LINK',
    approvedAnchors: Object.fromEntries(ids.map(id => [id, requirements.get(id).plannedTestIds.split(',')]))
  };
}

export function planEvidence(entry, vectors) {
  const { testId } = entry;
  const links = requirementLink(testId);
  const planId = testId.startsWith('BROWSER-') ? testId.slice(8) : testId;
  const v = vectors.get(planId);
  const described = browserPlans[testId];
  return {
    requirementId: links.ids,
    requirementLink: { source: links.source, kind: links.kind, approvedAnchors: links.approvedAnchors },
    initialState: described?.[0] ?? v?.initialSetup ?? null,
    input: described?.[1] ?? v?.testSteps ?? null,
    expected: described?.[2] ?? v?.expectedAssertions ?? entry.testObjective
  };
}
