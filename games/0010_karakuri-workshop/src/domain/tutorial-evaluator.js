import {Manifold} from '../../vendor/planck/planck.mjs';

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
  if (!upper || Math.abs(offset) + ROUNDING < .12 || Math.hypot(impulse.x, impulse.y) <= 1e-6) return 0;
  const r = {x: point.x - pivot.x, y: point.y - pivot.y};
  const direction = Math.sign(r.x * impulse.y - r.y * impulse.x);
  return direction * (omegaAfter - omegaBefore) > 1e-6 ? direction : 0;
}

export function createTutorialEvaluator(runId, parts, requirement = null) {
  const free = new Map(parts.filter(item => !item.fixed).map(item => [item.id, item.type]));
  const used = new Set();
  const seesaws = new Map();
  let ramp = null;
  function owned(input, type) {
    return input.runId === runId && free.get(input.id) === type;
  }
  function isRequired(id) {
    const type = free.get(id);
    return requirement === 'slope' ? type === 'R' : type === requirement;
  }
  return {
    observeRamp(input) {
      if (input.runId !== runId) return ramp;
      ramp = owned(input, 'R') ? rampTick(ramp, input, requirement === 'slope') : null;
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
      const usedIds = [...used];
      return {usedIds, achieved: requirement === null || usedIds.some(isRequired)};
    },
  };
}

export function isUpperSurface({localPoint, halfWidth, halfHeight, normalAlignment}) {
  return Math.abs(localPoint.x) <= halfWidth + ROUNDING
    && Math.abs(localPoint.y - halfHeight) <= .025 + ROUNDING && normalAlignment + ROUNDING >= TOP_ALIGNMENT;
}


const vector = ({x, y}) => ({x, y});
const difference = (a, b) => ({x: a.x - b.x, y: a.y - b.y});

export function circleRectangleGap(body, position, radius) {
  const {width, height} = body.getUserData();
  const {x, y} = body.getLocalPoint(position);
  const dx = Math.abs(x) - width / 2;
  const dy = Math.abs(y) - height / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(0, Math.max(dx, dy)) - radius;
}

export function attachTutorialPhysics(runtime, ball, parts, requirement) {
  const evaluator = createTutorialEvaluator(runtime.runId, parts, requirement);
  const definitions = new Map(parts.map(part => [part.body, part]));
  const ramps = parts.filter(part => part.type === 'R' && !part.fixed);
  const latest = new WeakMap();
  const wrapped = new WeakSet();
  const episode = new Map();
  const supports = new Map();
  const refreshed = new Manifold();
  let sequence = 0;
  let frames = [];
  let raw = [];
  let previousRamp = null;
  const {world, runId} = runtime;
  const radius = ball.getFixtureList().getShape().getRadius();

  function contactPair(contact) {
    const a = contact.getFixtureA();
    const b = contact.getFixtureB();
    const ballIsA = a.getBody() === ball;
    if (!ballIsA && b.getBody() !== ball) return null;
    const part = definitions.get((ballIsA ? b : a).getBody());
    return part ? {a, b, part, sign: ballIsA ? -1 : 1} : null;
  }

  function contactGeometry(pair, manifold) {
    if (!manifold?.pointCount) return null;
    const {part, sign} = pair;
    const point = vector(manifold.points[0]);
    const normal = {x: sign * manifold.normal.x, y: sign * manifold.normal.y};
    const localPoint = vector(part.body.getLocalPoint(point));
    const {width, height} = part.body.getUserData();
    const alignment = dot(normal, part.body.getWorldVector({x: 0, y: 1}));
    return {
      id: part.id, runId, point, normal, localPoint, normalAlignment: alignment, halfWidth: width / 2, halfHeight: height / 2,
      upper: isUpperSurface({localPoint, halfWidth: width / 2, halfHeight: height / 2, normalAlignment: alignment}),
    };
  }

  function finishEpisode(part) {
    const active = episode.get(part.id);
    if (active === undefined) return;
    evaluator.observeSeesaw({id: part.id, runId, episode: active, ended: true});
    episode.delete(part.id);
  }

  function watchLoad(contact) {
    if (wrapped.has(contact)) return;
    wrapped.add(contact);
    const solve = contact.solveVelocityConstraint;
    contact.solveVelocityConstraint = function(step) {
      const before = latest.get(this);
      if (!before || before.pair.part.type !== 'S' || !before.geometry.upper || !this.v_pointCount) {
        return solve.call(this, step);
      }
      const {part, sign} = before.pair;
      const {body} = part;
      if (this.v_pointCount !== 1) throw new Error('Unobservable ball/board load point.');
      const normalImpulseBefore = this.v_points[0].normalImpulse;
      const omegaBefore = body.c_velocity.w;
      const angleBefore = body.c_position.a;
      const pivot = vector(part.joint.getAnchorA());
      const result = solve.call(this, step);
      const magnitude = this.v_points[0].normalImpulse - normalImpulseBefore;
      if (magnitude > 1e-6) {
        const {point} = before.geometry;
        const impulse = {x: -sign * this.v_normal.x * magnitude, y: -sign * this.v_normal.y * magnitude};
        const load = {...before.geometry, tick: runtime.ticks + 1, substep: runtime.substep, pivot, impulse,
          offset: body.getLocalPoint(point).x, omegaBefore, omegaAfter: body.c_velocity.w, angleBefore,
          angle: body.getAngle(), episode: episode.get(part.id)};
        raw.push({event: 'solver-load', ...load});
        evaluator.observeSeesaw(load);
      }
      return result;
    };
  }

  function event(kind, contact, impulse) {
    const pair = contactPair(contact);
    if (!pair) return;
    const {part} = pair;
    const geometry = contactGeometry(pair, contact.getManifold().pointCount ? contact.getWorldManifold() : null);
    raw.push({event: kind, tick: runtime.ticks + 1, substep: runtime.substep, id: part.id,
      ...geometry, nativeTouching: contact.isTouching()});
    if (kind === 'end-contact' || (kind === 'pre-solve' && !geometry?.upper)) {
      supports.set(part.id, false);
      finishEpisode(part);
      latest.delete(contact);
      return;
    }
    if (kind === 'pre-solve' && geometry) {
      const approachSpeed = -dot(difference(ball.getLinearVelocityFromWorldPoint(geometry.point),
        part.body.getLinearVelocityFromWorldPoint(geometry.point)), geometry.normal);
      latest.set(contact, {pair, geometry, approachSpeed});
      if (part.type === 'S' && geometry.upper) {
        if (!episode.has(part.id)) episode.set(part.id, ++sequence);
        watchLoad(contact);
      }
    }
    if (kind !== 'post-solve' || part.type !== 'P') return;
    const before = latest.get(contact);
    if (!before) return;
    const platform = {...before.geometry, approachSpeed: before.approachSpeed,
      impulseY: before.geometry.normal.y * impulse.normalImpulses[0], ballMass: ball.getMass()};
    raw.push({event: 'platform-impact', tick: runtime.ticks + 1, substep: runtime.substep, ...platform});
    evaluator.observePlatform(platform);
  }

  for (const kind of ['begin-contact', 'end-contact', 'pre-solve', 'post-solve']) {
    const callback = (contact, impulse) => event(kind, contact, impulse);
    world.on(kind, callback);
    runtime.subscriptions.push([kind, callback]);
  }

  return {
    beginTick() {
      frames = [];
      raw = [];
      supports.clear();
      for (const part of ramps) supports.set(part.id, true);
    },
    observeBoundary(phase, substep) {
      const position = vector(ball.getPosition());
      const qualified = new Map();
      for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
        const pair = contactPair(contact);
        if (!pair) continue;
        const {a, b, part} = pair;
        const transformA = a.getBody().getTransform();
        const transformB = b.getBody().getTransform();
        refreshed.recycle();
        contact.evaluate(refreshed, transformA, transformB);
        if (!refreshed.pointCount) continue;
        const geometry = contactGeometry(pair, refreshed.getWorldManifold(
          undefined, transformA, a.getShape().getRadius(), transformB, b.getShape().getRadius()));
        if (geometry?.upper) qualified.set(part.id, geometry);
      }
      for (const part of ramps) {
        if (!qualified.has(part.id)) supports.set(part.id, false);
      }
      for (const part of parts) {
        if (part.type !== 'S') continue;
        if (qualified.has(part.id) && episode.has(part.id)) {
          evaluator.observeSeesaw({id: part.id, runId, upper: true, episode: episode.get(part.id), angle: part.body.getAngle()});
        } else if (!qualified.has(part.id)) finishEpisode(part);
      }
      frames.push({position, phase, substep, qualified: [...qualified.values()],
        rampDistances: ramps.map(({id, body}) => ({id, gap: circleRectangleGap(body, position, radius)}))});
    },
    completeTick(activation) {
      if (activation) evaluator.observeSpring({...activation, runId});
      const viable = ramps.filter(part => supports.get(part.id));
      const part = viable.find(part => part.id === previousRamp) ?? viable[0];
      const retained = part ?? ramps.find(part => part.id === previousRamp);
      if (retained) {
        const id = retained.id;
        const qualifyingOther = frames.some(frame => frame.qualified.some(point => point.id !== id));
        const distance = Math.max(...frames.map(frame => frame.rampDistances.find(ramp => ramp.id === id).gap));
        const ramp = evaluator.observeRamp({id, runId, angleDeg: retained.angleDeg, continuous: Boolean(part),
          from: frames[0].position, to: frames.at(-1).position, distance: qualifyingOther && !part ? Infinity : distance});
        previousRamp = ramp?.id ?? null;
      }
      return {state: evaluator.snapshot(), frames, raw, activation};
    },
  };
}
