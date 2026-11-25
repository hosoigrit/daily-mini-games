'use strict';

const assert = require('node:assert/strict');
const {before,test} = require('node:test');
let physics, factory, seesaw, spring;
before(async()=>{
  [physics,factory,seesaw,spring]=await Promise.all([
    import('../src/physics/adapter.js'),import('../src/physics/body-factory.js'),
    import('../src/physics/seesaw-controller.js'),import('../src/physics/spring-controller.js'),
  ]);
});
const center={x:4.8,y:3.6};
const point=({x,y})=>({x,y});
const snapshot=ball=>({position:point(ball.getPosition()),velocity:point(ball.getLinearVelocity()),
  angularVelocity:ball.getAngularVelocity()});
const near=(a,b,t=1e-6)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} versus ${b}`);
function setup(offset,speed){
  const runtime=physics.createWorld();
  const board=seesaw.createSeesawAssembly(runtime.world,{...center,id:'FX07'});
  const ball=factory.createBall(runtime.world,{x:center.x+offset,y:4.4});
  ball.setLinearVelocity({x:0,y:speed});
  return {runtime,board,ball};
}
function pinChecked(assembly){
  const {board,joint}=assembly;
  const lower=joint.getLowerLimit(),upper=joint.getUpperLimit();
  near(lower,-Math.PI/6);near(upper,Math.PI/6);
  assert.equal(joint.isMotorEnabled(),false);
  near(board.getMass(),.5);
  near(board.getAngularDamping(),1.2);
  assert.equal(joint.getBodyA().getFixtureList(),null);
}
function trial(offset,speed,geometry){
  const {runtime,board,ball,sim}=geometry?combine(geometry):setup(offset,speed);
  const samples=[],load=[];
  const native=board.board;
  const calc=()=>{
    const anchorA=point(board.joint.getAnchorA()),anchorB=point(board.joint.getAnchorB());
    return {anchorA,anchorB,angle:native.getAngle()*180/Math.PI,angularVelocity:native.getAngularVelocity(),
      pivotError:Math.hypot(anchorB.x-anchorA.x,anchorB.y-anchorA.y)};
  };
  try{
    pinChecked(board);
    runtime.observe=(row)=>{
      const state=calc();
      assert(Object.values(state).filter(v=>typeof v==='number').every(Number.isFinite));
      const observed=seesaw.evaluateSeesawState(board);
      near(observed.pivotError,state.pivotError);
      near(observed.angle*180/Math.PI,state.angle);
      samples.push({tick:row.ticks+1,substep:row.substep,phase:row.phase,...state});
    };
    runtime.world.on('post-solve',(contact,impulse)=>{
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody();
      if(!((a===ball&&b===native)||(a===native&&b===ball)))return;
      const m=contact.getWorldManifold(),sign=a===ball?-1:1;
      const angle=native.getAngle(),up={x:-Math.sin(angle),y:Math.cos(angle)};
      for(let j=0;j<m.pointCount;j++){
        const p=point(m.points[j]),normal={x:sign*m.normal.x,y:sign*m.normal.y};
        const J=impulse.normalImpulses[j];
        const {x,y}=board.joint.getAnchorB();
        const torque=-(p.x-x)*normal.y*J+(p.y-y)*normal.x*J;
        load.push({tick:runtime.ticks+1,substep:runtime.substep,p,normal,J,torque,
          alignment:normal.x*up.x+normal.y*up.y,angle,angularVelocity:native.getAngularVelocity()});
      }
    });
    let error=null;
    for(let i=0;i<120;i++){
      const advanced=sim ? sim.advanceTick().advanced : physics.advancePhysicsTick(runtime);
      if(!advanced){error=physics.getDiagnostics(runtime);break;}
    }
    const final=calc();
    const pivot=Math.max(final.pivotError,...samples.map(x=>x.pivotError));
    const excursion=Math.max(Math.abs(final.angle),...samples.map(x=>Math.abs(x.angle)));
    return {runId:runtime.runId,offset,speed,ticks:runtime.ticks,error,pivot,excursion,final,samples,load};
  }finally{physics.disposeWorld(runtime);}
}
function runPass(result,angleLimit,t){
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.error,null);
  assert.equal(result.ticks,120);
  assert.equal(result.samples.length,480);
  assert(result.load.some(x=>x.J>0));
  assert(result.pivot<=.02);
  assert(result.excursion<=angleLimit);
}
test('TC-D2-027-C001 applied ball torque and left/right rotation from real contacts',t=>{
  for(const offset of [-.6,.6]){
    const run=trial(offset,0);
    runPass(run,32,t);
    const first=run.load.find(e=>e.J>1e-6&&e.alignment>=Math.cos(Math.PI/6));
    assert(first);
    assert.equal(Math.sign(first.torque),-Math.sign(offset));
    assert.equal(Math.sign(first.angularVelocity),Math.sign(first.torque));
    assert.equal(Math.sign(run.final.angle),Math.sign(first.torque));
  }
});
test('TC-D2-028-C001 centered drop stays within two degrees',t=>runPass(trial(0,0),2,t));
test('TC-D2-029-C001 left/right static and high-speed loads',t=>{
  for(const speed of [-12,0]) for(const offset of [-.6,.6]) runPass(trial(offset,speed),32,t);
});

function releasedBeforeNew({runtime,board,ball}){
  const {angle,...state}=seesaw.evaluateSeesawState(board);
  assert(angle===0);
  assert.deepEqual(snapshot(ball),{position:{x:4.2,y:4.4},velocity:{x:0,y:0},angularVelocity:0});
  assert.deepEqual(state,{angularVelocity:0,pivot:center,pivotError:0,motorEnabled:false});
  assert.equal(runtime.ticks,0);
  assert.deepEqual(physics.collectContactEvidence(runtime),[]);
  assert.equal(physics.getDiagnostics(runtime),null);
}
test('TC-D2-035-C001 new world follows real tilted world',t=>{
  const first=trial(-.6,0);
  runPass(first,32,t);
  assert(first.final.angle>0);
  const next=setup(-.6,0);
  try{
    assert.notEqual(next.runtime.runId,first.runId);
    releasedBeforeNew(next);
    t.diagnostic(JSON.stringify({oldWorld:first.runId,newWorld:next.runtime.runId,new:seesaw.evaluateSeesawState(next.board)}));
  }finally{physics.disposeWorld(next.runtime);}
});

function combine(geometry) {
  const runtime=physics.createWorld();
  const board=seesaw.createSeesawAssembly(runtime.world,{...geometry.board,id:'S'});
  const b=geometry.spring;
  const body=factory.createStaticBody(runtime.world,{...b,kind:'B',id:'B',width:.72,height:.24});
  const ball=factory.createBall(runtime.world,geometry.ball);
  const sim=spring.createSpringSimulation(runtime,ball,[{id:'B',body,center:b,gridX:b.x/.24,gridY:(7.2-b.y)/.24,angleDeg:0}]);
  return {runtime,board,ball,sim};
}
function cleanCheck(previous,now,geometry){
  const {runtime,board,ball,sim}=now;
  assert.notEqual(runtime.runId,previous);
  assert.equal(runtime.ticks,0);
  assert.deepEqual(physics.collectContactEvidence(runtime),[]);
  assert.equal(physics.getDiagnostics(runtime),null);
  assert.deepEqual(snapshot(ball),{position:geometry.ball,velocity:{x:0,y:0},angularVelocity:0});
  const pose=seesaw.evaluateSeesawState(board);
  near(pose.angle,0);near(pose.angularVelocity,0);near(pose.pivotError,0);
  assert.deepEqual(pose.pivot,geometry.board);
  assert.deepEqual(sim.state('B'),{phase:'READY',quietTicks:0});
  assert.equal(runtime.trajectory,undefined);
  assert.equal(runtime.requiredUse,undefined);
  return {runId:runtime.runId,ball:snapshot(ball),board:pose,spring:sim.state('B'),
    contactEvidence:physics.collectContactEvidence(runtime),ticks:runtime.ticks};
}
test('TC-D1-032-C001 explicitly contaminated old run cannot carry into new world',t=>{
  const geometry={board:{x:7.5,y:2.4},spring:{x:4.8,y:2.4},ball:{x:4.8,y:2.77}};
  const old=combine(geometry);
  try{
    let activated=false;
    for(let i=0;i<60&&!activated;i++){
      const row=old.sim.advanceTick();
      assert(row.advanced);
      activated=Boolean(row.activation);
    }
    assert(activated);
    assert.equal(old.sim.state('B').phase,'WAIT_RELEASE');
    old.runtime.trajectory=[{tick:34,x:8,y:2}];
    old.runtime.requiredUse={spring:true,seesaw:true};
    old.runtime.ticks=34;
    old.board.board.setAngle(.28);old.board.board.setAngularVelocity(2);
    old.ball.setLinearVelocity({x:5,y:2});
    const next=combine(geometry);
    try{t.diagnostic(JSON.stringify(cleanCheck(old.runtime.runId,next,geometry)));}
    finally{physics.disposeWorld(next.runtime);}
  }finally{physics.disposeWorld(old.runtime);}
});
test('TC-D1-032-C002 after native spring launch and independent tilted runs',t=>{
  const springGeometry={board:{x:7.5,y:2.4},spring:{x:4.8,y:2.4},ball:{x:4.8,y:2.77}};
  const run=combine(springGeometry), id=run.runtime.runId;
  let actual=null,independent=0;
  try{
    run.runtime.world.on('pre-solve',contact=>{
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody();
      if(a===run.ball&&b.getUserData()?.kind==='B'||b===run.ball&&a.getUserData()?.kind==='B') independent++;
    });
    for(let i=0;i<60;i++){
      const row=run.sim.advanceTick();
      assert(row.advanced);
      if(row.activation){actual=row.activation;break;}
    }
    assert(actual&&independent>0);
    near(actual.velocity.x,0);near(actual.velocity.y,9.5);
  }finally{physics.disposeWorld(run.runtime);}
  const fresh=combine(springGeometry);
  try{t.diagnostic(JSON.stringify({actual,independent,restored:cleanCheck(id,fresh,springGeometry)}));}
  finally{physics.disposeWorld(fresh.runtime);}
  for(const side of [-1,1]){
    const geo={board:center,spring:{x:3,y:1.4},ball:{x:center.x+side*.6,y:4.4}};
    const old=trial(side*.6,0,geo);
    runPass(old,32,t);
    assert.equal(Math.sign(old.final.angle),-side);
    const following=combine(geo);
    try{t.diagnostic(JSON.stringify(cleanCheck(old.runId,following,geo)));}
    finally{physics.disposeWorld(following.runtime);}
  }
});
