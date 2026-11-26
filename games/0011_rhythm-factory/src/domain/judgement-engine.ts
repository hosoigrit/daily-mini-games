import type {
  ChartEvent, CommittedJudgementGroup, CompiledChart, Contracts, FinalResult,
  GameError, Gen, JudgementResult, Lane, NormalizedInput, Result, ScoreEvent, Us,
} from '../contracts/interface_contracts';
import { createInputQueue, deliveryWaitUs, inputFailure } from './input-queue';
import { createLifeState, createScoreState, reduceLife, reduceScore, summarizeScore } from './judgement-reducers';
import { classifyTimingError, goodWindowUs } from './judgement-timing';

interface Hold {
  readonly start: ChartEvent;
  readonly end: ChartEvent;
  holder: string | null;
}

interface Group {
  readonly groupId: string;
  readonly timeUs: Us;
  readonly events: ChartEvent[];
}

type Ghost = Extract<ScoreEvent, { kind: 'GHOST' }>;
type Options = { readonly sessionId: string; readonly generation: Gen; readonly offsetUs?: Us };

function buildChartIndex(chart: CompiledChart) {
  if (!Number.isSafeInteger(chart.durationUs) || chart.durationUs <= 0
      || chart.events.length === 0 || chart.totalJudgements !== chart.events.length
      || !['EASY', 'NORMAL', 'HARD'].includes(chart.difficulty)) return null;

  const events = chart.events.map(event => Object.freeze({ ...event })).sort(
    (left, right) => left.targetTimeUs - right.targetTimeUs || left.lane - right.lane,
  );
  const eventIds = new Set<string>();
  const groupTimes = new Map<string, Us>();
  const groups: Group[] = [];
  const holdParts = new Map<string, { start?: ChartEvent; end?: ChartEvent }>();
  const candidates = new Map<Lane, ChartEvent[]>();

  for (const event of events) {
    if (!event.eventId || !event.noteId || !event.groupId || eventIds.has(event.eventId)
        || !Number.isSafeInteger(event.targetTimeUs) || event.targetTimeUs < 0
        || event.targetTimeUs > chart.durationUs || !Number.isSafeInteger(event.targetTimeUs + goodWindowUs)
        || ![1, 2, 3, 4].includes(event.lane)
        || !['TAP', 'HOLD_START', 'HOLD_END'].includes(event.type)) return null;

    eventIds.add(event.eventId);
    const priorTime = groupTimes.get(event.groupId);
    if (priorTime !== undefined && priorTime !== event.targetTimeUs) return null;
    groupTimes.set(event.groupId, event.targetTimeUs);
    const group = groups.at(-1);
    if (group?.timeUs === event.targetTimeUs) {
      if (group.groupId !== event.groupId || group.events.some(member => member.lane === event.lane)) return null;
      group.events.push(event);
    } else {
      groups.push({ groupId: event.groupId, timeUs: event.targetTimeUs, events: [event] });
    }

    if (event.type !== 'HOLD_END') {
      const laneEvents = candidates.get(event.lane) ?? [];
      laneEvents.push(event);
      candidates.set(event.lane, laneEvents);
    }
    if (event.type !== 'TAP') {
      const parts = holdParts.get(event.noteId) ?? {};
      const side = event.type === 'HOLD_START' ? 'start' : 'end';
      if (parts[side]) return null;
      parts[side] = event;
      holdParts.set(event.noteId, parts);
    }
  }

  const holds = new Map<string, Hold>();
  for (const [noteId, { start, end }] of holdParts) {
    if (!start || !end || start.lane !== end.lane || end.targetTimeUs <= start.targetTimeUs) return null;
    holds.set(noteId, { start, end, holder: null });
  }
  return { events, groups, holds, candidates };
}

export function createJudgementEngine(chart: CompiledChart, { sessionId, generation, offsetUs = 0 as Us }: Options) {
  const { chartId, musicId, difficulty, durationUs, totalJudgements } = chart;
  const index = buildChartIndex(chart);
  const lastTargetUs = index?.events.at(-1)?.targetTimeUs;
  const closeJudgeUs = Math.max(durationUs - offsetUs, (lastTargetUs ?? 0) + goodWindowUs);
  if (!index || typeof sessionId !== 'string' || !sessionId.trim() || !Number.isSafeInteger(generation) || generation < 0
      || !Number.isSafeInteger(offsetUs) || !Number.isSafeInteger(closeJudgeUs)) {
    return inputFailure('ERR-018', 'judgement.invalidConfiguration', sessionId);
  }

  const { events, groups, holds, candidates } = index;
  const inputQueue = createInputQueue(sessionId, generation, closeJudgeUs as Us, offsetUs);
  const resolutions = new Map<string, JudgementResult>();
  const official: ScoreEvent[] = [];
  const ghosts: Ghost[] = [];
  const laneOwners = new Map<Lane, string>();
  const ownedLanes = new Map<string, Lane>();
  const heldNotes = new Map<Lane, Hold>();
  let deadlineIndex = 0;
  let groupIndex = 0;
  let ghostIndex = 0;
  let scoreState = createScoreState(totalJudgements);
  let lifeState = createLifeState();
  let finalResult: FinalResult | null = null;
  let stopError: GameError | null = null;
  const summarize = () => summarizeScore(scoreState);

  function resolve(event: ChartEvent, judgement: JudgementResult['judgement'], errorUs: Us | null) {
    resolutions.set(event.eventId, Object.freeze({
      eventId: event.eventId, groupId: event.groupId, targetTimeUs: event.targetTimeUs, judgement, errorUs,
    }));
  }

  function resolveEnd(hold: Hold, judgement: JudgementResult['judgement'], errorUs: Us | null) {
    resolve(hold.end, judgement, errorUs);
    heldNotes.delete(hold.end.lane);
    hold.holder = null;
  }

  function expire(event: ChartEvent) {
    if (resolutions.has(event.eventId)) return;
    if (event.type === 'HOLD_END') {
      const hold = holds.get(event.noteId);
      if (hold) resolveEnd(hold, 'MISS', null);
      return;
    }

    resolve(event, 'MISS', null);
    const hold = event.type === 'HOLD_START' ? holds.get(event.noteId) : undefined;
    if (hold) resolve(hold.end, 'MISS', null);
  }

  function down(input: NormalizedInput) {
    if (laneOwners.has(input.lane) || ownedLanes.has(input.inputId)) return;
    laneOwners.set(input.lane, input.inputId);
    ownedLanes.set(input.inputId, input.lane);

    let candidate: ChartEvent | undefined;
    let nearest = goodWindowUs + 1;
    for (const event of candidates.get(input.lane) ?? []) {
      const distance = Math.abs(input.judgeTimeUs - event.targetTimeUs);
      if (event.targetTimeUs > input.judgeTimeUs && distance > goodWindowUs) break;
      if (distance < nearest && !resolutions.has(event.eventId)) {
        candidate = event;
        nearest = distance;
      }
    }
    if (!candidate) {
      ghosts.push(Object.freeze({ kind: 'GHOST', eventId: input.eventId, judgeTimeUs: input.judgeTimeUs }));
      return;
    }
    const errorUs = (input.judgeTimeUs - candidate.targetTimeUs) as Us;
    const grade = classifyTimingError(errorUs);
    if (grade === null) return;
    resolve(candidate, grade, errorUs);
    const hold = candidate.type === 'HOLD_START' ? holds.get(candidate.noteId) : undefined;
    if (hold) {
      hold.holder = input.inputId;
      heldNotes.set(input.lane, hold);
    }
  }

  function inputAt(input: NormalizedInput) {
    if (input.action === 'DOWN') {
      down(input);
      return;
    }
    if (laneOwners.get(input.lane) !== input.inputId) return;
    laneOwners.delete(input.lane);
    ownedLanes.delete(input.inputId);
    const hold = heldNotes.get(input.lane);
    if (hold?.holder === input.inputId) {
      const errorUs = (input.judgeTimeUs - hold.end.targetTimeUs) as Us;
      const grade = classifyTimingError(errorUs);
      resolveEnd(hold, grade ?? 'MISS', grade === null ? null : errorUs);
    }
  }

  function mergeInputsAndDeadlines(inputs: readonly NormalizedInput[], watermark: Us) {
    let inputIndex = 0;
    while (true) {
      const input = inputs[inputIndex];
      const nextDeadline = events[deadlineIndex];
      const deadline = nextDeadline ? nextDeadline.targetTimeUs + goodWindowUs : Infinity;
      if (input && input.judgeTimeUs <= deadline) {
        inputAt(input);
        inputIndex++;
      } else if (nextDeadline && deadline < watermark) {
        expire(nextDeadline);
        deadlineIndex++;
      } else {
        return;
      }
    }
  }

  function finish(outcome: FinalResult['outcome'], endJudgeTimeUs: Us) {
    const summary = summarize();
    if (!summary.ok) return summary;
    const { score, rank, counts, maxCombo, totalJudgements } = summary.value;
    finalResult = Object.freeze({
      sessionId, chartId, musicId, difficulty,
      outcome, score, rank, counts: Object.freeze({ ...counts }), maxCombo, totalJudgements,
      remainingLifeUnits: lifeState.currentUnits, endJudgeTimeUs, durationUs,
    });
    resolutions.clear();
    laneOwners.clear();
    ownedLanes.clear();
    heldNotes.clear();
    for (const hold of holds.values()) hold.holder = null;
    inputQueue.seal();
    return { ok: true, value: undefined } as const;
  }

  function commitBefore(watermark: Us): Result<void> {
    while (true) {
      const group = groups[groupIndex];
      const ghost = ghosts[ghostIndex];
      const time = Math.min(group?.timeUs ?? Infinity, ghost?.judgeTimeUs ?? Infinity) as Us;
      if (time >= watermark) return { ok: true, value: undefined };

      let nextScore = scoreState;
      let nextLife = lifeState;
      const changes: ScoreEvent[] = [];
      if (group?.timeUs === time) {
        const results = group.events.map(event => resolutions.get(event.eventId));
        if (!results.every(result => result !== undefined)) return { ok: true, value: undefined };
        const committed: CommittedJudgementGroup = Object.freeze({
          groupId: group.groupId, targetTimeUs: time, results: Object.freeze(results),
        });
        const change: ScoreEvent = Object.freeze({ kind: 'GROUP', group: committed });
        const score = reduceScore(scoreState, change);
        const life = reduceLife(lifeState, difficulty, committed);
        if (!score.ok) return score;
        if (!life.ok) return life;
        nextScore = score.value;
        nextLife = life.value;
        changes.push(change);
      }

      let nextGhostIndex = ghostIndex;
      for (let sameTime = ghosts[nextGhostIndex]; sameTime?.judgeTimeUs === time; sameTime = ghosts[nextGhostIndex]) {
        const score = reduceScore(nextScore, sameTime);
        if (!score.ok) return score;
        nextScore = score.value;
        nextGhostIndex++;
        changes.push(sameTime);
      }

      scoreState = nextScore;
      lifeState = nextLife;
      ghostIndex = nextGhostIndex;
      if (group?.timeUs === time) groupIndex++;
      official.push(...changes);
      if (lifeState.currentUnits === 0) return finish('FAILED', time);
    }
  }

  const enqueueInput: Contracts['enqueueInput'] = input => {
    if (stopError && input?.sessionId === sessionId && input.clockGeneration === generation) {
      return { ok: false, error: stopError };
    }
    const receipt = inputQueue.enqueueInput(input);
    if (!receipt.ok && receipt.error.code === 'ERR-007') stopError = receipt.error;
    return receipt;
  };

  function advance(judgeNowUs: Us): Result<void> {
    if (finalResult) return { ok: true, value: undefined };
    if (stopError) return { ok: false, error: stopError };
    const watermark = (Number.isSafeInteger(judgeNowUs) ? judgeNowUs - deliveryWaitUs : NaN) as Us;
    const batch = inputQueue.drainBefore(watermark);
    if (!batch.ok) {
      stopError = batch.error;
      return batch;
    }
    mergeInputsAndDeadlines(batch.value.events, watermark);
    const result = commitBefore(watermark);
    if (!result.ok) {
      stopError = result.error;
      return result;
    }
    if (!finalResult && watermark > closeJudgeUs && groupIndex === groups.length) {
      return finish('CLEAR', closeJudgeUs as Us);
    }
    return result;
  }

  return {
    ok: true,
    value: {
      enqueueInput, advance,
      getFinalResult: (): FinalResult | null => finalResult,
      read() {
        return {
          summary: summarize(),
          lifeUnits: lifeState.currentUnits,
          processedBeforeUs: inputQueue.processedBeforeUs,
          deliveryDelaysOver50Ms: inputQueue.delaysOver50Ms,
          lateInputs: inputQueue.lateInputs,
          stopError,
          pressedLanes: [...laneOwners.keys()].sort(),
          activeHolds: [...heldNotes].map(([lane, hold]) => ({
            lane, noteId: hold.start.noteId, holder: hold.holder,
          })).sort((left, right) => left.lane - right.lane),
          official: [...official],
        };
      },
    },
  } as const;
}
