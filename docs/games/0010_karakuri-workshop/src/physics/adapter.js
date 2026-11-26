import {Manifold, Vec2, World} from '../../vendor/planck/planck.mjs';
import {ABNORMAL_ANGULAR_SPEED, ABNORMAL_SPEED, BALL, DEFAULT_GRAVITY, JOINT_ANGLE_TOLERANCE, MAX_PIVOT_DRIFT,
  PHYSICS_PROFILES, SELECTED_PHYSICS_PROFILE, TICK_SECONDS} from '../data/physics-config.js';
import {createStaticBody} from './body-factory.js';

const copy = ({x, y}) => ({x, y});
const kind = body => body.getUserData()?.kind;

function bodyState(body) {
  return {
    ...body.getUserData(), position: copy(body.getPosition()), velocity: copy(body.getLinearVelocity()),
    angle: body.getAngle(), angularVelocity: body.getAngularVelocity(),
  };
}

export function getPhysicsSnapshot(runtime) {
  const bodies = [];
  for (let body = runtime.world?.getBodyList(); body; body = body.getNext()) bodies.push(bodyState(body));
  return {ticks: runtime.ticks, elapsedSeconds: runtime.ticks * TICK_SECONDS, bodies};
}

export function validatePhysicsState(runtime) {
  for (let body = runtime.world.getBodyList(); body; body = body.getNext()) {
    const {position, velocity, angle, angularVelocity} = bodyState(body);
    if (![position.x, position.y, velocity.x, velocity.y, angle, angularVelocity].every(Number.isFinite)) {
      throw new Error('NON_FINITE_BODY_STATE');
    }
    if (body.isDynamic() && (Math.hypot(velocity.x, velocity.y) > ABNORMAL_SPEED
      || Math.abs(angularVelocity) > ABNORMAL_ANGULAR_SPEED)) {
      throw new Error('ABNORMAL_BODY_SPEED');
    }
  }
  for (let joint = runtime.world.getJointList(); joint; joint = joint.getNext()) {
    if (joint.getType() !== 'revolute-joint') continue;
    const a = joint.getAnchorA();
    const b = joint.getAnchorB();
    const angle = joint.getJointAngle();
    const offset = Math.hypot(a.x - b.x, a.y - b.y);
    if (!Number.isFinite(offset) || offset > MAX_PIVOT_DRIFT || !Number.isFinite(angle)
      || (joint.isLimitEnabled() && (angle < joint.getLowerLimit() - JOINT_ANGLE_TOLERANCE
        || angle > joint.getUpperLimit() + JOINT_ANGLE_TOLERANCE))) {
      throw new Error('ABNORMAL_JOINT_CONSTRAINT');
    }
  }
}

export function applyVelocityLimit(body) {
  const {x, y} = body.getLinearVelocity();
  const speed = Math.hypot(x, y);
  if (speed > BALL.maxSpeed) {
    const ratio = BALL.maxSpeed / speed;
    body.setLinearVelocity(Vec2(x * ratio, y * ratio));
  }
  const omega = body.getAngularVelocity();
  if (Math.abs(omega) > BALL.maxAngularSpeed) {
    body.setAngularVelocity(Math.sign(omega) * BALL.maxAngularSpeed);
  }
}

function limitBall(runtime) {
  for (let body = runtime.world.getBodyList(); body; body = body.getNext()) {
    if (kind(body) === 'ball') applyVelocityLimit(body);
  }
}

export function normalizeContactPoint(ballIsA, rawNormal, ballVelocity, otherVelocity) {
  const sign = ballIsA ? -1 : 1;
  const normal = {x: sign * rawNormal.x, y: sign * rawNormal.y};
  const approachSpeed = -((ballVelocity.x - otherVelocity.x) * normal.x
    + (ballVelocity.y - otherVelocity.y) * normal.y);
  return {normal, approachSpeed};
}

export function recordContactOccurrence(runtime, occurrence) {
  const identity = JSON.stringify([occurrence.runId, occurrence.tick, occurrence.substep, occurrence.callbackIndex]);
  if (runtime.contactOccurrences.has(identity)) return;
  runtime.contactOccurrences.add(identity);
  runtime.contacts.push(occurrence);
}

function watchContacts(runtime) {
  for (const event of ['begin-contact', 'end-contact', 'pre-solve', 'post-solve']) {
    const record = (contact, extra) => {
      const a = contact.getFixtureA().getBody();
      const b = contact.getFixtureB().getBody();
      const ballIsA = kind(a) === 'ball';
      if (!ballIsA && kind(b) !== 'ball') return;
      const ball = ballIsA ? a : b;
      const other = ballIsA ? b : a;
      const manifold = contact.getManifold().pointCount > 0 ? contact.getWorldManifold() : null;
      const points = [];
      if (manifold?.normal) {
        for (let i = 0; i < manifold.pointCount; i++) {
          const point = manifold.points[i];
          const velocity = ball.getLinearVelocityFromWorldPoint(point);
          const otherVelocity = other.getLinearVelocityFromWorldPoint(point);
          points.push({
            position: copy(point),
            ...normalizeContactPoint(ballIsA, manifold.normal, velocity, otherVelocity),
            separation: manifold.separations[i],
            ...(event === 'post-solve' ? {normalImpulse: extra.normalImpulses[i]} : {}),
          });
        }
      }
      // Callback order is evidence about the observer, not a certified continuous collision timeline.
      recordContactOccurrence(runtime, {
        event, runId: runtime.runId, tick: runtime.ticks + 1, substep: runtime.substep,
        callbackIndex: runtime.contacts.length, other: {...other.getUserData()}, points,
      });
    };
    runtime.world.on(event, record);
    runtime.subscriptions.push([event, record]);
  }
}

let worldSequence = 0;

export function createWorld({profile = SELECTED_PHYSICS_PROFILE, gravity = DEFAULT_GRAVITY, observe = null,
  runId = `world-${++worldSequence}`} = {}) {
  if (!Object.hasOwn(PHYSICS_PROFILES, profile) || ![gravity.x, gravity.y].every(Number.isFinite)) {
    throw new RangeError('Unknown physical profile or invalid gravity.');
  }
  const world = new World({gravity: Vec2(gravity.x, gravity.y), allowSleep: false, continuousPhysics: true});
  const runtime = {
    world, profile, observe, runId, ticks: 0, substep: 0, contacts: [], contactOccurrences: new Set(),
    subscriptions: [], diagnostic: null,
  };
  watchContacts(runtime);
  return runtime;
}

export function collectContactEvidence(runtime) {
  return structuredClone(runtime.contacts);
}

export function getDiagnostics(runtime) {
  return runtime.diagnostic ? {...runtime.diagnostic} : null;
}

export function advancePhysicsTick(runtime) {
  if (!runtime.world || runtime.diagnostic) return false;
  runtime.contacts = [];
  runtime.contactOccurrences.clear();
  const {substeps, velocityIterations, positionIterations} = PHYSICS_PROFILES[runtime.profile];
  try {
    validatePhysicsState(runtime);
    for (let substep = 0; substep < substeps; substep++) {
      runtime.substep = substep;
      validatePhysicsState(runtime);
      runtime.observe?.({phase: 'before-step', substep, ...getPhysicsSnapshot(runtime)});
      limitBall(runtime);
      runtime.world.step(TICK_SECONDS / substeps, velocityIterations, positionIterations);
      validatePhysicsState(runtime);
      runtime.observe?.({phase: 'after-step-before-limit', substep, ...getPhysicsSnapshot(runtime)});
      limitBall(runtime);
    }
    runtime.ticks++;
    return true;
  } catch (error) {
    runtime.diagnostic = {runId: runtime.runId, tick: runtime.ticks + 1, substep: runtime.substep,
      message: error instanceof Error ? error.message : String(error)};
    return false;
  }
}

export function disposeWorld(runtime) {
  const world = runtime.world;
  if (!world) return;
  const subscriptions = runtime.subscriptions;
  tutorialLoadObservers.delete(world);
  experimentDisposers.get(world)?.();
  experimentDisposers.delete(world);
  runtime.world = null;
  runtime.observe = null;
  runtime.contacts = [];
  runtime.contactOccurrences.clear();
  runtime.subscriptions = [];
  for (const [name, handler] of subscriptions) world.off(name, handler);
  // A Planck exception can leave the world locked. It is detached and must never be stepped again.
  if (world.isLocked()) return;
  for (let body = world.getBodyList(); body;) {
    const next = body.getNext();
    world.destroyBody(body);
    body = next;
  }
}

// Planck recycles contacts across worlds. A pooled wrapper must never capture an experiment.
const tutorialLoadObservers = new WeakMap();
const wrappedContacts = new WeakSet();
const experimentDisposers = new WeakMap();
const dot = (a, b) => a.x * b.x + a.y * b.y;

function watchLoad(contact) {
  if (wrappedContacts.has(contact)) return;
  wrappedContacts.add(contact);
  const solve = contact.solveVelocityConstraint;
  contact.solveVelocityConstraint = function(step) {
    const world = this.getFixtureA()?.getBody().getWorld();
    const observer = tutorialLoadObservers.get(world);
    return observer ? observer(this, step, solve) : solve.call(this, step);
  };
}

const difference = (a, b) => ({x: a.x - b.x, y: a.y - b.y});

function circleRectangleGap(body, position, radius) {
  const {width, height} = body.getUserData();
  const {x, y} = body.getLocalPoint(position);
  const dx = Math.abs(x) - width / 2;
  const dy = Math.abs(y) - height / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(0, Math.max(dx, dy)) - radius;
}

function observeTutorialPhysics(runtime, ball, parts, rules, isUpperSurface) {
  const definitions = new Map(parts.map(part => [part.body, part]));
  const ramps = parts.filter(part => part.type === 'R' && !part.fixed);
  const latest = new WeakMap();
  const episode = new Map();
  const refreshed = new Manifold();
  let sequence = 0;
  let frames = [];
  let raw = [];
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
    const point = copy(manifold.points[0]);
    const normal = {x: sign * manifold.normal.x, y: sign * manifold.normal.y};
    const localPoint = copy(part.body.getLocalPoint(point));
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
    rules.observeSeesaw({id: part.id, runId, episode: active, ended: true});
    episode.delete(part.id);
  }

  tutorialLoadObservers.set(world, (contact, step, solve) => {
    const before = latest.get(contact);
    if (!before || before.pair.part.type !== 'S' || !before.geometry.upper || !contact.v_pointCount) {
      return solve.call(contact, step);
    }
    const {part, sign} = before.pair;
    const {body} = part;
    if (contact.v_pointCount !== 1) throw new Error('Unobservable ball/board load point.');
    const normalImpulseBefore = contact.v_points[0].normalImpulse;
    const omegaBefore = body.c_velocity.w;
    const angleBefore = body.c_position.a;
    const pivot = copy(part.joint.getAnchorA());
    const result = solve.call(contact, step);
    const magnitude = contact.v_points[0].normalImpulse - normalImpulseBefore;
    if (magnitude > 1e-6) {
      const {point} = before.geometry;
      const impulse = {x: -sign * contact.v_normal.x * magnitude, y: -sign * contact.v_normal.y * magnitude};
      const tangent = {x: Math.cos(angleBefore), y: Math.sin(angleBefore)};
      const load = {...before.geometry, tick: runtime.ticks + 1, substep: runtime.substep, pivot, impulse,
        offset: dot(difference(point, pivot), tangent), omegaBefore, omegaAfter: body.c_velocity.w, angleBefore,
        angle: body.getAngle(), episode: episode.get(part.id)};
      raw.push({event: 'solver-load', ...load});
      rules.observeSeesaw(load);
    }
    return result;
  });

  function event(kind, contact, impulse) {
    const pair = contactPair(contact);
    if (!pair) return;
    const {part} = pair;
    const geometry = contactGeometry(pair, contact.getManifold().pointCount ? contact.getWorldManifold() : null);
    raw.push({event: kind, tick: runtime.ticks + 1, substep: runtime.substep, id: part.id,
      ...geometry, nativeTouching: contact.isTouching()});
    if (kind === 'end-contact' || (kind === 'pre-solve' && !geometry?.upper)) {
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
    rules.observePlatform(platform);
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
    },
    observeBoundary(phase, substep) {
      const position = copy(ball.getPosition());
      const qualified = new Map();
      const contacts = [];
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
        if (geometry) contacts.push(geometry);
        if (geometry?.upper) qualified.set(part.id, geometry);
      }
      for (const part of parts) {
        if (part.type !== 'S') continue;
        if (qualified.has(part.id) && episode.has(part.id)) {
          rules.observeSeesaw({id: part.id, runId, upper: true, episode: episode.get(part.id), angle: part.body.getAngle()});
        } else if (!qualified.has(part.id)) finishEpisode(part);
      }
      frames.push({position, phase, substep, contacts, qualified: [...qualified.values()],
        rampDistances: ramps.map(({id, body}) => ({id, gap: circleRectangleGap(body, position, radius)}))});
    },
    completeTick(activation) {
      return rules.completeTick(frames, raw, activation);
    },
  };
}

export function bindGoalBodies(goalGeometry) {
  return (world, origin) => goalGeometry().map((box, i) => createStaticBody(world, {
    ...box, x: origin.x + box.x, y: origin.y + box.y, kind: 'goal', id: `goal-${i}`,
  }));
}

// This is the composition boundary for the physical world and the value-only rule callbacks.
export function bindRuleSimulation({createTutorialRules, isUpperSurface, createSpringSimulation, createGoalStability}) {
  return function(runtime, {ball, goal, solidBodies, parts, requirement, springSpeed}) {
    const {world, runId} = runtime;
    if (!world || experimentDisposers.has(world)) throw new Error('The physical experiment already has a rule observer or is closed.');
    const partDescriptors = parts.map(({id, type, fixed, angleDeg}) => ({id, type, fixed, angleDeg}));
    const rules = createTutorialRules(runId, partDescriptors, requirement);
    const tutorial = observeTutorialPhysics(runtime, ball, parts, rules, isUpperSurface);
    const springs = parts.filter(part => part.type === 'B');
    const simulator = createSpringSimulation(runtime, ball, springs, springSpeed);
    const tracker = createGoalStability({x: goal.x, y: goal.y});
    const original = runtime.observe;
    const radius = ball.getFixtureList().getShape().getRadius();
    let samples = [];
    function observe() {
      const center = ball.getPosition();
      const velocity = ball.getLinearVelocity();
      const penetration = solidBodies.reduce((maximum, body) =>
        Math.max(maximum, -circleRectangleGap(body, center, radius)), 0);
      return {position: copy(center), velocity: copy(velocity), penetration};
    }

    runtime.observe = row => {
      samples.push(observe());
      tutorial.observeBoundary(row.phase, row.substep);
      original?.(row);
    };
    const initial = observe();
    tracker.observe(0, [initial]);
    let lastPosition = copy(initial.position);
    let tick = runtime.ticks + 1;
    let advance = () => {
      samples = [];
      tutorial.beginTick();
      const physical = simulator.advanceTick();
      const boundary = observe();
      lastPosition = copy(boundary.position);
      tick = runtime.ticks + 1;
      if (!physical.advanced) return {error: true, tick, position: boundary.position};
      samples.push(boundary);
      const usage = tutorial.completeTick(physical.activation);
      const stability = tracker.observe(runtime.ticks, samples);
      return {tick: runtime.ticks, position: boundary.position, stable: stability.achieved, requiredUse: usage.state.achieved,
        samples, stability, usage};
    };
    experimentDisposers.set(world, () => { advance = null; });
    return {advanceTick: () => advance ? advance() : {error: true, tick, position: copy(lastPosition)}};
  };
}
