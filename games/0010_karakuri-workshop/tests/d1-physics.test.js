'use strict';

const assert = require('node:assert/strict');
const {before, test} = require('node:test');

let config;
let physics;
let factory;
let createSimulationController;
before(async () => {
  [config, physics, factory, {createSimulationController}] = await Promise.all([
    import('../src/data/physics-config.js'),
    import('../src/physics/adapter.js'),
    import('../src/physics/body-factory.js'),
    import('../src/physics/simulation-controller.js'),
  ]);
});

function near(actual, expected, tolerance = 1e-6) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} expected ${expected} ± ${tolerance}`);
}

function advance(runtime, ticks) {
  for (let i = 0; i < ticks; i++) {
    assert.equal(physics.advancePhysicsTick(runtime), true, JSON.stringify(physics.getDiagnostics(runtime)));
  }
}

test('TC-D1-003/004/005/006: logical positions and clockwise angles convert to Planck coordinates', () => {
  assert.deepEqual(config.logicalToPhysical(0, 0), {x: 0, y: 7.2});
  assert.deepEqual(config.logicalToPhysical(960, 720), {x: 9.6, y: 0});
  for (let gy = 0; gy <= 30; gy++) {
    for (let gx = 0; gx <= 40; gx++) {
      const position = config.logicalToPhysical(gx * 24, gy * 24);
      near(position.x, 0.24 * gx);
      near(position.y, 7.2 - 0.24 * gy);
      const converted = config.physicalToLogical(position.x, position.y);
      near(converted.x, gx * 24);
      near(converted.y, gy * 24);
    }
  }
  for (let degrees = -60; degrees <= 60; degrees += 15) {
    near(config.physicalAngle(degrees), -degrees * Math.PI / 180);
  }
});

test('TC-D1-007: actual Planck ball has mass, radius, spin and CCD settings', t => {
  const runtime = physics.createWorld();
  t.after(() => physics.disposeWorld(runtime));
  const ball = factory.createBall(runtime.world, {x: 4.8, y: 6.5});
  near(ball.getMass(), 0.20);
  near(ball.getFixtureList().getShape().getRadius(), 0.20);
  near(ball.getAngularVelocity(), 0);
  assert.equal(ball.isBullet(), true);
  assert.equal(ball.isFixedRotation(), false);
  assert.equal(ball.getLinearVelocity().length(), 0);
});

for (const profile of ['PP01', 'PP02', 'PP03']) {
  test(`TC-D1-009-C001 (${profile}): free fall under real gravity for 60 ticks`, t => {
    const runtime = physics.createWorld({profile});
    t.after(() => physics.disposeWorld(runtime));
    factory.createBall(runtime.world, {x: 4.8, y: 6.5, linearDamping: 0, angularDamping: 0});
    advance(runtime, 60);
    const {bodies: [ball], ...clock} = physics.getPhysicsSnapshot(runtime);
    near(ball.position.x, 4.8);
    assert(ball.position.y >= 1.50 && ball.position.y <= 1.70);
    assert(ball.velocity.y >= -9.81 && ball.velocity.y <= -9.79);
    near(ball.velocity.x, 0);
    near(clock.elapsedSeconds, 1);
    t.diagnostic(JSON.stringify({case: 'TC-D1-009-C001', profile, ball, ...clock}));
  });

  test(`TC-D1-010-C001 (${profile}): real horizontal contact and resting penetration`, t => {
    const runtime = physics.createWorld({profile});
    t.after(() => physics.disposeWorld(runtime));
    const platform = {width: 1.2, height: 0.16, x: 4.8, y: 2.4, kind: 'P', id: 'fx04'};
    factory.createStaticBody(runtime.world, platform);
    const ball = factory.createBall(runtime.world, {x: 4.8, y: 3.48});
    let contacts = 0;
    let maxPenetration = 0;
    const samples = [];
    for (let tick = 1; tick <= 180; tick++) {
      advance(runtime, 1);
      const position = ball.getPosition();
      assert(position.y > platform.y - platform.height / 2);
      const top = physics.collectContactEvidence(runtime).filter(event => event.event === 'pre-solve'
        && event.points.some(point => point.normal.y > 0.99));
      contacts += top.length;
      if (top.length && !samples.length) samples.push(top[0]);
      if (tick >= 120) maxPenetration = Math.max(maxPenetration, 2.48 + 0.20 - position.y);
    }
    assert(contacts > 0);
    assert(maxPenetration <= 0.01);
    t.diagnostic(JSON.stringify({case: 'TC-D1-010-C001', profile, contacts, maxPenetration, samples}));
  });
}

test('TC-D1-019-C001 fixture: a real joint keeps its pivot when loaded from either side', t => {
  // The first pilot ran PP01 and its measured failure is retained. This test targets the named candidate.
  const profile = process.env.E1_JOINT_CANDIDATE ?? 'PP03';
  for (const side of [-1, 1]) {
    const runtime = physics.createWorld({profile});
    try {
      const board = factory.createDynamicBody(runtime.world, {
        width: 1.92, height: 0.16, x: 4.8, y: 3.6, kind: 'S', id: 'fx07',
        density: 0.30 / (1.92 * 0.16), angularDamping: 1.2,
      });
      const joint = factory.createRevoluteJoint(runtime.world, board, {x: 4.8, y: 3.6});
      factory.createBall(runtime.world, {x: 4.8 + side * 0.60, y: 4.4});
      let maxPivot = 0;
      let maxAngle = 0;
      let contacts = 0;
      for (let tick = 0; tick < 120; tick++) {
        advance(runtime, 1);
        contacts += physics.collectContactEvidence(runtime).filter(row => row.other.kind === 'S'
          && row.points.length > 0).length;
        const a = joint.getAnchorA();
        const b = joint.getAnchorB();
        maxPivot = Math.max(maxPivot, Math.hypot(a.x - b.x, a.y - b.y));
        maxAngle = Math.max(maxAngle, Math.abs(board.getAngle()) * 180 / Math.PI);
      }
      assert(maxPivot <= 0.02);
      assert(maxAngle <= 32);
      assert(contacts > 0);
      t.diagnostic(JSON.stringify({case: 'TC-D1-019-C001', profile, fixtureAngularDamping: 1.2, side, maxPivot, maxAngle, contacts}));
    } finally {
      physics.disposeWorld(runtime);
    }
  }
});

test('TC-D1-023: excess ticks are dropped and long gaps require an explicit resume', t => {
  const runtime = physics.createWorld();
  t.after(() => physics.disposeWorld(runtime));
  factory.createBall(runtime.world, {x: 4.8, y: 6.5});
  const controller = createSimulationController(runtime);
  controller.start();
  assert.equal(controller.advanceFrame(0), 0);
  assert.equal(controller.advanceFrame(100), 5);
  assert.equal(controller.advanceFrame(101), 0);
  assert.equal(controller.advanceFrame(351), 0);
  assert.equal(controller.phase, 'PAUSED');
  assert.equal(controller.advanceFrame(900), 0);
  controller.resume();
  assert.equal(controller.advanceFrame(900), 0);
  assert.equal(controller.advanceFrame(920), 1);
  assert.equal(controller.advanceFrame(930, {hidden: true}), 0);
  assert.equal(controller.phase, 'PAUSED');
  assert.equal(controller.snapshot().ticks, 6);
});

test('TC-D1-024/028: the speed limit is radial and abnormal state stops before capping', t => {
  const runtime = physics.createWorld();
  t.after(() => physics.disposeWorld(runtime));
  const ball = factory.createBall(runtime.world, {x: 4.8, y: 6.5});
  ball.setLinearVelocity({x: 12, y: 9});
  ball.setAngularVelocity(80);
  physics.applyVelocityLimit(ball);
  near(ball.getLinearVelocity().x, 9.6);
  near(ball.getLinearVelocity().y, 7.2);
  near(ball.getAngularVelocity(), 60);
  ball.setLinearVelocity({x: 31, y: 0});
  assert.equal(physics.advancePhysicsTick(runtime), false);
  assert.equal(physics.getDiagnostics(runtime).message, 'ABNORMAL_BODY_SPEED');
  assert.equal(physics.getPhysicsSnapshot(runtime).ticks, 0);
  near(ball.getLinearVelocity().x, 31);
});


test('TC-D1-029: failed locked world detaches and another run can advance', () => {
  const first = physics.createWorld({runId: 'E1-disposal-fixture'});
  const brokenEngine = first.world;
  factory.createStaticBody(brokenEngine, {width:1.2, height:.16, x:4.8, y:2.4, kind:'P'});
  factory.createBall(brokenEngine, {x:4.8, y:2.68});
  brokenEngine.on('pre-solve', () => { throw new Error('fixture observer exception'); });
  assert.equal(physics.advancePhysicsTick(first), false);
  assert.deepEqual(physics.getDiagnostics(first), {runId:'E1-disposal-fixture',tick:1,substep:0,
    message:'fixture observer exception'});
  assert.equal(brokenEngine.isLocked(), true);
  physics.disposeWorld(first);
  physics.disposeWorld(first);
  assert.equal(first.world, null);
  assert.deepEqual(first.subscriptions, []);
  assert.equal(physics.advancePhysicsTick(first), false);
  const following=physics.createWorld({runId:'E1-following-fixture'});
  try {
    factory.createBall(following.world,{x:4.8,y:6.5});
    advance(following,1);
    assert.deepEqual(physics.collectContactEvidence(following),[]);
  } finally {
    physics.disposeWorld(following);
  }
});
