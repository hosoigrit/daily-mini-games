import {advancePhysicsTick, applyVelocityLimit, normalizeContactPoint, validatePhysicsState} from './adapter.js';

const MIN_ALIGNMENT = Math.cos(Math.PI / 6);
const MIN_APPROACH = .4;
const BLOCKING_ALIGNMENT = -.5;
const RELEASE_DISTANCE = .04;
const SPRING_HALF_WIDTH = .36;
const SPRING_HALF_HEIGHT = .12;
const ROUNDING = 8 * Number.EPSILON;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const relativeTo = (point, center) => ({x: point.x - center.x, y: point.y - center.y});
const vector = ({x, y}) => ({x, y});

export function launchNormal(angleDeg) {
  const radians = angleDeg * Math.PI / 180;
  return {x: Math.sin(radians), y: Math.cos(radians)};
}

function springCoordinates(center, launch, point) {
  const offset = relativeTo(point, center);
  return {x: offset.x * launch.y - offset.y * launch.x, y: dot(offset, launch)};
}

export function springSeparation(spring, ballPosition, radius) {
  const local = springCoordinates(spring.center, launchNormal(spring.angleDeg), ballPosition);
  const dx = Math.max(0, Math.abs(local.x) - SPRING_HALF_WIDTH);
  const dy = Math.max(0, Math.abs(local.y) - SPRING_HALF_HEIGHT);
  return {distance: Math.max(0, Math.hypot(dx, dy) - radius), above: local.y + ROUNDING >= SPRING_HALF_HEIGHT};
}

export function evaluateSpringContact(spring, point) {
  const launch = launchNormal(spring.angleDeg);
  const local = springCoordinates(spring.center, launch, point.position);
  const alignment = dot(launch, point.normal);
  if (Math.abs(local.x) > SPRING_HALF_WIDTH + ROUNDING
    || Math.abs(local.y - SPRING_HALF_HEIGHT) > .025 + ROUNDING || alignment + ROUNDING < MIN_ALIGNMENT
    || point.approachSpeed < MIN_APPROACH) {
    return null;
  }
  return {spring, launch, approachSpeed: point.approachSpeed, alignment};
}

const quantized = value => Math.round(1000 * value);
const rank = (a, b) => quantized(b.approachSpeed) - quantized(a.approachSpeed)
  || quantized(b.alignment) - quantized(a.alignment)
  || a.spring.gridX - b.spring.gridX || a.spring.gridY - b.spring.gridY || a.spring.angleDeg - b.spring.angleDeg;

export function selectSpringActivation(candidates) {
  return candidates.reduce((best, candidate) => !best || rank(candidate, best) < 0 ? candidate : best, null);
}

export function updateSpringRelease(state, touched, distance) {
  if (state.phase === 'READY') return state;
  const quietTicks = !touched && distance + ROUNDING >= RELEASE_DISTANCE ? state.quietTicks + 1 : 0;
  return quietTicks >= 2 ? {phase: 'READY', quietTicks: 0} : {phase: 'WAIT_RELEASE', quietTicks};
}

export function applySpringLaunch(runtime, ball, candidate, speed) {
  validatePhysicsState(runtime);
  ball.setLinearVelocity({x: speed * candidate.launch.x, y: speed * candidate.launch.y});
  validatePhysicsState(runtime);
  applyVelocityLimit(ball);
  return {type: 'SPRING_ACTIVATED', springId: candidate.spring.id, tick: runtime.ticks,
    velocity: vector(ball.getLinearVelocity()), angularVelocity: ball.getAngularVelocity()};
}

function compareTimes(a, b) {
  return a.substep - b.substep || a.phase - b.phase || a.toi - b.toi;
}

function blockingStatus(candidate, contacts, raw) {
  const {spring, launch} = candidate;
  if (contacts.some(contact => contact.id !== spring.id && dot(launch, contact.normal) <= BLOCKING_ALIGNMENT)) {
    return 'blocked';
  }
  const end = raw.find(event => event.id === spring.id && event.event === 'end-contact'
    && compareTimes(event, candidate.time) >= 0);
  if (!end) return 'clear';
  let tied = false;
  for (const onset of raw) {
    if (onset.id === spring.id || onset.event !== 'begin-contact' || compareTimes(onset, end) < 0) continue;
    const impact = raw.some(event => event.id === onset.id && event.event === 'post-solve'
      && compareTimes(event, onset) === 0 && event.points.some(point => point.normalImpulse > 1e-6
        && dot(launch, point.normal) <= BLOCKING_ALIGNMENT));
    if (!impact) continue;
    if (compareTimes(onset, end) > 0) return 'blocked';
    tied = true;
  }
  return tied ? 'unresolved-order' : 'clear';
}

export function createSpringController(definitions, speed = 9.5) {
  const springs = new Map(definitions.map(({id, center, gridX, gridY, angleDeg}) =>
    [id, {id, center: vector(center), gridX, gridY, angleDeg}]));
  const states = new Map(definitions.map(spring => [spring.id, {phase: 'READY', quietTicks: 0}]));
  return {
    state: id => ({...states.get(id)}),
    completeTick(frame) {
      const touched = new Set([...frame.raw.map(event => event.id),
        ...frame.touchingAtEnd.map(contact => contact.id), ...(frame.touchingAtBoundaries ?? [])]);
      const candidates = [];
      for (const event of frame.raw) {
        const spring = springs.get(event.id);
        if (!spring || event.event !== 'pre-solve' || states.get(spring.id).phase !== 'READY') continue;
        for (const point of event.points) {
          const candidate = evaluateSpringContact(spring, point);
          if (candidate) candidates.push({...candidate, time: event});
        }
      }
      const unresolved = [];
      const eligible = candidates.filter(candidate => {
        const end = springSeparation(candidate.spring, frame.ballPosition, frame.radius);
        if (!end.above || end.distance > .25 + ROUNDING) return false;
        const status = blockingStatus(candidate, frame.touchingAtEnd, frame.raw);
        if (status === 'unresolved-order') unresolved.push(candidate.spring.id);
        return status === 'clear';
      });
      for (const [id, spring] of springs) {
        const state = states.get(id);
        if (state.phase === 'READY' && touched.has(id)) {
          states.set(id, {phase: 'WAIT_RELEASE', quietTicks: 0});
        } else {
          const distances = (frame.boundaryPositions ?? [frame.ballPosition]).map(position =>
            springSeparation(spring, position, frame.radius).distance);
          states.set(id, updateSpringRelease(state, touched.has(id), Math.min(...distances)));
        }
      }
      const winner = selectSpringActivation(eligible);
      return {winner, speed, candidates, eligible, unresolved};
    },
  };
}

export function createSpringSimulation(runtime, ball, definitions, speed = 9.5) {
  const controller = createSpringController(definitions, speed);
  const ids = new Map(definitions.map(spring => [spring.body, spring.id]));
  const otherIds = new WeakMap();
  let otherCount = 0;
  const world = runtime.world;
  const radius = ball.getFixtureList().getShape().getRadius();
  let raw, boundaryPositions, touchingAtBoundaries;
  let tracing = false;
  let toiPhase = false;
  const solver = world.m_solver;
  const solveTOI = solver.solveWorldTOI;
  solver.solveWorldTOI = function(...args) {
    toiPhase = true;
    try {
      return solveTOI.apply(this, args);
    } finally {
      toiPhase = false;
    }
  };
  function pair(contact) {
    const a = contact.getFixtureA().getBody();
    const b = contact.getFixtureB().getBody();
    if (a !== ball && b !== ball) return null;
    const other = a === ball ? b : a;
    if (!ids.has(other) && !otherIds.has(other)) otherIds.set(other, `#body-${++otherCount}`);
    return {other, id: ids.get(other) ?? otherIds.get(other), ballIsA: a === ball};
  }
  function pointsFor(contact, {other, ballIsA}, impulse) {
    const manifold = contact.getManifold().pointCount ? contact.getWorldManifold() : null;
    if (!manifold) return [];
    return manifold.points.slice(0, manifold.pointCount).map((point, i) => ({
      position: vector(point),
      ...normalizeContactPoint(ballIsA, manifold.normal, ball.getLinearVelocityFromWorldPoint(point),
        other.getLinearVelocityFromWorldPoint(point)),
      ...(impulse ? {normalImpulse: impulse.normalImpulses[i]} : {}),
    }));
  }
  function sampleBoundary() {
    boundaryPositions.push(vector(ball.getPosition()));
    for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
      if (!contact.isTouching()) continue;
      const info = pair(contact);
      if (info && ids.has(info.other)) touchingAtBoundaries.add(info.id);
    }
  }
  const step = world.step;
  world.step = function(...args) {
    if (tracing) sampleBoundary();
    const result = step.apply(this, args);
    if (tracing) sampleBoundary();
    return result;
  };
  for (const event of ['begin-contact', 'pre-solve', 'post-solve', 'end-contact']) {
    const observe = (contact, extra) => {
      if (!tracing) return;
      const info = pair(contact);
      if (!info) return;
      raw.push({event, id: info.id, substep: runtime.substep, phase: Number(toiPhase),
        toi: toiPhase ? ball.m_sweep.alpha0 : 0,
        points: pointsFor(contact, info, event === 'post-solve' ? extra : null)});
    };
    world.on(event, observe);
    runtime.subscriptions.push([event, observe]);
  }
  return {
    state: controller.state,
    advanceTick() {
      raw = [];
      boundaryPositions = [];
      touchingAtBoundaries = new Set();
      tracing = true;
      let advanced;
      try {
        advanced = advancePhysicsTick(runtime);
      } finally {
        tracing = false;
      }
      if (!advanced) return {advanced: false};
      const touchingAtEnd = [];
      for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
        if (!contact.isTouching()) continue;
        const info = pair(contact);
        if (!info) continue;
        for (const {normal} of pointsFor(contact, info)) touchingAtEnd.push({id: info.id, normal});
      }
      const frame = {raw, touchingAtEnd, touchingAtBoundaries: [...touchingAtBoundaries], boundaryPositions,
        ballPosition: vector(ball.getPosition()), radius};
      const {winner, candidates, eligible, unresolved} = controller.completeTick(frame);
      const activation = winner ? applySpringLaunch(runtime, ball, winner, speed) : null;
      return {advanced: true, activation, candidates, eligible, unresolved, frame};
    },
  };
}
