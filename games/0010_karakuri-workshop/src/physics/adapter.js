import {Vec2, World} from '../../vendor/planck/planck.mjs';
import {ABNORMAL_ANGULAR_SPEED, ABNORMAL_SPEED, BALL, DEFAULT_GRAVITY, PHYSICS_PROFILES,
  TICK_SECONDS} from '../data/physics-config.js';

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
        const sign = ballIsA ? -1 : 1;
        const normal = {x: sign * manifold.normal.x, y: sign * manifold.normal.y};
        for (let i = 0; i < manifold.pointCount; i++) {
          const point = manifold.points[i];
          const velocity = ball.getLinearVelocityFromWorldPoint(point);
          const otherVelocity = other.getLinearVelocityFromWorldPoint(point);
          points.push({
            position: copy(point), normal,
            separation: manifold.separations[i],
            approachSpeed: -((velocity.x - otherVelocity.x) * normal.x
              + (velocity.y - otherVelocity.y) * normal.y),
            ...(event === 'post-solve' ? {normalImpulse: extra.normalImpulses[i]} : {}),
          });
        }
      }
      // Callback order is evidence about the observer, not a certified continuous collision timeline.
      runtime.contacts.push({
        event, tick: runtime.ticks + 1, substep: runtime.substep,
        callbackIndex: runtime.contacts.length, other: {...other.getUserData()}, points,
      });
    };
    runtime.world.on(event, record);
    runtime.subscriptions.push([event, record]);
  }
}

export function createWorld({profile = 'PP01', gravity = DEFAULT_GRAVITY, observe = null} = {}) {
  if (!Object.hasOwn(PHYSICS_PROFILES, profile) || ![gravity.x, gravity.y].every(Number.isFinite)) {
    throw new RangeError('Unknown physical profile or invalid gravity.');
  }
  const world = new World({gravity: Vec2(gravity.x, gravity.y), allowSleep: false, continuousPhysics: true});
  const runtime = {
    world, profile, observe, ticks: 0, substep: 0, contacts: [], subscriptions: [], diagnostic: null,
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
    runtime.diagnostic = {tick: runtime.ticks + 1, substep: runtime.substep,
      message: error instanceof Error ? error.message : String(error)};
    return false;
  }
}

export function disposeWorld(runtime) {
  if (!runtime.world) return;
  for (const [name, handler] of runtime.subscriptions) runtime.world.off(name, handler);
  while (runtime.world.getBodyList()) runtime.world.destroyBody(runtime.world.getBodyList());
  runtime.world = null;
  runtime.observe = null;
  runtime.contacts = [];
  runtime.subscriptions = [];
}
