import {normalizeUsageRequirement, summarizeUsage} from './usage-requirements.js';

const ROUNDING = 8 * Number.EPSILON;
const TOP_ALIGNMENT = Math.cos(Math.PI / 6);
const FIVE_DEGREES = Math.PI / 36;
const dot = (a, b) => a.x * b.x + a.y * b.y;

export function rampTick(previous, observation, requireSlope = false) {
  const {id, angleDeg, continuous, distance, from, to} = observation;
  if (!id || (requireSlope && angleDeg === 0)) return null;
  if (!continuous) {
    return previous?.id === id && previous.gap === 0 && distance <= .005 + ROUNDING
      ? {...previous, gap: 1} : null;
  }
  const state = previous?.id === id ? previous : {id, intervals: 0, displacement: 0};
  const theta = angleDeg * Math.PI / 180;
  const tangent = {x: Math.cos(theta), y: -Math.sin(theta)};
  const delta = dot({x: to.x - from.x, y: to.y - from.y}, tangent);
  const displacement = state.displacement + (angleDeg < 0 ? -delta : delta);
  const intervals = state.intervals + 1;
  const progress = angleDeg === 0 ? Math.abs(displacement) : displacement;
  return {id, intervals, displacement, progress, gap: 0,
    achieved: intervals >= 3 && progress + ROUNDING >= .24};
}

export function qualifiesPlatformUse({upper, approachSpeed, impulseY, ballMass}) {
  return upper && ballMass > 0 && approachSpeed + ROUNDING >= .20 && impulseY / ballMass + ROUNDING >= .10;
}

export function seesawLoadDirection({upper, offset, point, pivot, impulse, omegaBefore, omegaAfter}) {
  if (!upper || !impulse || Math.abs(offset) + ROUNDING < .12 || Math.hypot(impulse.x, impulse.y) <= 1e-6) return 0;
  const r = {x: point.x - pivot.x, y: point.y - pivot.y};
  const direction = Math.sign(r.x * impulse.y - r.y * impulse.x);
  return direction * (omegaAfter - omegaBefore) > 1e-6 ? direction : 0;
}

export function createTutorialEvaluator(runId, parts, requirement = null) {
  const free = new Map(parts.filter(item => !item.fixed).map(item => [item.id, item.type]));
  const usageRequirement = normalizeUsageRequirement(requirement);
  const used = new Set();
  const seesaws = new Map();
  let ramp = null;
  function owned(input, type) {
    return input.runId === runId && free.get(input.id) === type;
  }
  return {
    observeRamp(input) {
      if (input.runId !== runId) return ramp;
      ramp = owned(input, 'R') ? rampTick(ramp, input, usageRequirement === 'slope') : null;
      if (ramp?.achieved) used.add(input.id);
      return ramp;
    },
    observePlatform(input) {
      if (owned(input, 'P') && qualifiesPlatformUse(input)) used.add(input.id);
    },
    observeSpring(input) {
      const {runId: origin, springId, type} = input;
      if (type === 'SPRING_ACTIVATED' && owned({runId: origin, id: springId}, 'B')) used.add(springId);
    },
    observeSeesaw(input) {
      if (!owned(input, 'S')) return;
      const {id, episode, angle, angleBefore, ended} = input;
      let state = seesaws.get(id);
      if (ended) {
        if (state?.episode === episode) seesaws.delete(id);
        return;
      }
      if (!input.upper) return;
      if (!state || state.episode !== episode) {
        if (state) seesaws.delete(id);
        const direction = seesawLoadDirection(input);
        if (!direction) return;
        state = {episode, direction, startAngle: angleBefore};
        seesaws.set(id, state);
      }
      if (state.direction * (angle - state.startAngle) + ROUNDING >= FIVE_DEGREES) used.add(id);
    },
    snapshot() {
      return summarizeUsage(usageRequirement, used, free);
    },
  };
}

export function isUpperSurface({localPoint, halfWidth, halfHeight, normalAlignment}) {
  return Math.abs(localPoint.x) <= halfWidth + ROUNDING
    && Math.abs(localPoint.y - halfHeight) <= .025 + ROUNDING && normalAlignment + ROUNDING >= TOP_ALIGNMENT;
}

export function createRampContactTracker(runId, ramps, evaluator) {
  let previous = null;
  return {
    completeTick(frames, events) {
      if (frames.length === 0) return previous && {...previous};
      const upperEvents = events.filter(event => event.event === 'pre-solve'
        && event.localPoint && isUpperSurface(event));
      function staysOnRamp({id}) {
        return frames.every(frame => frame.contacts.some(contact => contact.id === id && isUpperSurface(contact)))
          && !events.some(event => event.id === id && (event.event === 'end-contact'
            || event.event === 'pre-solve' && (!event.localPoint || !isUpperSurface(event))));
      }
      const continuousRamps = ramps.filter(staysOnRamp);
      const continuous = continuousRamps.find(ramp => ramp.id === previous?.id) ?? continuousRamps[0];
      const selected = continuous ?? ramps.find(ramp => ramp.id === previous?.id);
      if (!selected) return null;
      const {id, angleDeg} = selected;
      const switched = !continuous && (upperEvents.some(event => event.id !== id)
        || frames.some(frame => frame.contacts.some(contact => contact.id !== id && isUpperSurface(contact))));
      const distance = switched ? Infinity
        : Math.max(...frames.map(frame => frame.rampDistances.find(ramp => ramp.id === id).gap));
      previous = evaluator.observeRamp({id, angleDeg, runId, continuous: Boolean(continuous), distance,
        from: frames[0].position, to: frames.at(-1).position});
      return previous && {...previous};
    },
  };
}

export function createTutorialRules(runId, parts, requirement) {
  const evaluator = createTutorialEvaluator(runId, parts, requirement);
  const ramps = parts.filter(part => part.type === 'R' && !part.fixed);
  const rampTracker = createRampContactTracker(runId, ramps, evaluator);
  return {
    observeSeesaw: evaluator.observeSeesaw,
    observePlatform: evaluator.observePlatform,
    completeTick(frames, raw, activation) {
      if (activation) evaluator.observeSpring({...activation, runId});
      const ramp = rampTracker.completeTick(frames, raw);
      return {state: evaluator.snapshot(), ramp, frames, raw, activation};
    },
  };
}
