'use strict';

const assert = require('node:assert/strict');
const {before,test} = require('node:test');
let springs, physics, factory;
before(async()=>{
  [springs, physics, factory] = await Promise.all([
    import('../src/physics/spring-controller.js'), import('../src/physics/adapter.js'), import('../src/physics/body-factory.js'),
  ]);
});

const center = {x:4.8,y:2.4};
const specimen = {id:'spring',center,angleDeg:0,gridX:20,gridY:20};
const normal = {x:0,y:1};
const near = (a,b) => assert(Math.abs(a-b)<=1e-6,`${a} versus ${b}`);
const positionFrom = (v,d) => ({x:center.x+v.x*d,y:center.y+v.y*d});
const caseName = (p,c) => `TC-D2-${String(p).padStart(3,'0')}-C${String(c).padStart(3,'0')}`;
const unit = (parent,index,name,fn) => test(caseName(parent,index)+' '+name,fn);
const time = (substep=0,phase=0,toi=0) => ({substep,phase,toi});
function point({position=positionFrom(normal,.12),normal:direction=normal,approachSpeed=.5} = {}) {
  return {position,normal:direction,approachSpeed};
}
function frame({raw=[],touchingAtEnd=[],ballPosition=positionFrom(normal,.32)}={}) {
  const tick=10,runId='fixture';
  return {raw:raw.map(event=>({tick,runId,...event})),tick,runId,touchingAtEnd,ballPosition,radius:.2};
}
function event(id,kind='pre-solve',points=[point()],at=time()) {
  return {id,event:kind,points,...at};
}
function syntheticLaunch(angle,approach,angularVelocity=1){
  const radians=angle*Math.PI/180;
  const n={x:Math.sin(radians),y:Math.cos(radians)};
  const runtime=physics.createWorld({gravity:{x:0,y:0}});
  try {
    const def={...specimen,angleDeg:angle};
    const position=positionFrom(n,.32);
    const ball=factory.createBall(runtime.world,position);
    ball.setLinearVelocity({x:0,y:-approach});ball.setAngularVelocity(angularVelocity);
    const controller=springs.createSpringController([def]);
    const contact=point({position:positionFrom(n,.12),normal:n,approachSpeed:approach});
    const candidate=controller.completeTick(frame({raw:[event(def.id,'pre-solve',[contact])],ballPosition:position})).winner;
    assert(candidate);
    const result=springs.applySpringLaunch(runtime,ball,candidate,9.5);
    near(result.velocity.x,9.5*n.x);near(result.velocity.y,9.5*n.y);
    assert.equal(result.angularVelocity,angularVelocity);
    assert.deepEqual({x:ball.getPosition().x,y:ball.getPosition().y},position);
  }finally{physics.disposeWorld(runtime);}
}

unit(15,1,'exact positive thresholds through product normalization and launch',()=>{
  for(const v of [.4,.5]) syntheticLaunch(0,v,0);
});
unit(16,1,'side back out-of-width off-surface and steep normal do not launch',()=>{
  const variants=[
    point({position:{x:5.16,y:2.4},normal:{x:1,y:0}}),
    point({position:{x:4.8,y:2.28},normal:{x:0,y:-1}}),
    point({position:{x:5.16001,y:2.52}}),
    point({position:{x:4.8,y:2.545001}}),
    point({normal:{x:Math.sin(30.001*Math.PI/180),y:Math.cos(30.001*Math.PI/180)}}),
    point({position:{x:5.16,y:2.52},normal:{x:1,y:0}}),
  ];
  for(const p of variants){
    const control=springs.createSpringController([specimen]);
    assert.equal(control.completeTick(frame({raw:[event(specimen.id,'pre-solve',[p])]})).winner,null);
  }
});
for(const [i,value] of [.399,.4,.401].entries()) unit(17,i+1,`qualifying approach ${value}`,()=>{
  assert.equal(!!springs.evaluateSpringContact(specimen,point({approachSpeed:value})),value!==.399);
});
const angles=[-45,-30,-15,0,15,30,45];
for(const [i,degrees] of angles.entries()) unit(18,i+2,`component and angular velocity for ${degrees}°`,()=>{
  syntheticLaunch(degrees,2);
});
for(const [i,v] of [1,3,6].entries()) unit(19,i+2,`sets launch velocity rather than adding incoming ${v}`,()=>{
  syntheticLaunch(0,v,0);
});

unit(20,1,'continued contact does not relaunch',()=>{
  const control=springs.createSpringController([specimen]);
  for(let i=0;i<10;i++){
    const result=control.completeTick(frame({raw:[event(specimen.id)]}));
    assert.equal(!!result.winner,i===0);
    assert.equal(control.state(specimen.id).phase,'WAIT_RELEASE');
  }
});
unit(21,1,'two complete clear ticks permit a new launch',()=>{
  const control=springs.createSpringController([specimen]);
  assert(control.completeTick(frame({raw:[event(specimen.id)]})).winner);
  const clear=frame({ballPosition:positionFrom(normal,.36)});
  control.completeTick(clear);
  assert.equal(control.state(specimen.id).phase,'WAIT_RELEASE');
  control.completeTick(clear);
  assert.equal(control.state(specimen.id).phase,'READY');
  assert(control.completeTick(frame({raw:[event(specimen.id)]})).winner);
});
unit(22,1,'short, single or interrupted absence remains in WAIT_RELEASE',()=>{
  const pre=frame({raw:[event(specimen.id)]});
  const nearGap=frame({ballPosition:positionFrom(normal,.359)});
  const clearGap=frame({ballPosition:positionFrom(normal,.36)});
  const interrupted={...clearGap,touchingAtBoundaries:[specimen.id]};
  for(const steps of [[nearGap,nearGap],[clearGap],[clearGap,interrupted]]) {
    const control=springs.createSpringController([specimen]);
    assert(control.completeTick(pre).winner);
    for(const step of steps) assert.equal(control.completeTick(step).winner,null);
    assert.equal(control.state(specimen.id).phase,'WAIT_RELEASE');
    assert.equal(control.completeTick(pre).winner,null);
  }
  const control=springs.createSpringController([specimen]);
  assert(control.completeTick(pre).winner);
  control.completeTick(clearGap);
  assert.equal(control.state(specimen.id).quietTicks,1);
  const incomplete={...clearGap,boundaryPositions:[positionFrom(normal,.359),positionFrom(normal,.36)]};
  control.completeTick(incomplete);
  assert.equal(control.state(specimen.id).quietTicks,0);
});
const selection = count => Array.from({length:count},(_,i) => ({
  ...specimen,id:`spring-${i+1}`,gridX:i+2,
}));
unit(23,1,'two and three candidates invoke a single winner',()=>{
  for (const count of [2,3]) {
    const defs=selection(count);
    const control=springs.createSpringController(defs);
    const raw=defs.map(s=>event(s.id));
    const result=control.completeTick(frame({raw}));
    assert.equal(result.eligible.length,count);
    assert.equal(result.winner.spring.id,defs[0].id,'only one winner per game tick');
    assert(defs.every(s=>control.state(s.id).phase==='WAIT_RELEASE'));
  }
});
unit(24,1,'loser still touching on next tick cannot activate',()=>{
  const defs=selection(2);
  const control=springs.createSpringController(defs);
  assert.equal(control.completeTick(frame({raw:defs.map(s=>event(s.id))})).winner.spring.id,defs[0].id);
  assert.equal(control.completeTick(frame({raw:[event(defs[1].id)]})).winner,null);
});
const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function selectionTrial(rawIntegration) {
  const definitions = selection(3);
  for (const tie of [true,false]) for(const order of orders){
    const alignment=[.9994,tie?.9994:1,1], approaches=[1.0004,1.0003,.9994];
    const expected=tie?definitions[0]:definitions[1];
    if(rawIntegration){
      const control=springs.createSpringController(definitions);
      const raw=order.map(i=>event(definitions[i].id,'pre-solve',[point({
        normal:{x:Math.sqrt(1-alignment[i]**2),y:alignment[i]},approachSpeed:approaches[i],
      })]));
      assert.equal(control.completeTick(frame({raw})).winner.spring.id,expected.id);
    }else{
      const candidates=order.map(i=>({spring:definitions[i],alignment:alignment[i],approachSpeed:approaches[i]}));
      assert.equal(springs.selectSpringActivation(candidates).spring.id,expected.id);
    }
  }
}
unit(25,1,'quantized canonical ranking for all six permutations',()=>selectionTrial(false));
unit(25,2,'product matching and ranking through all six notification orders',()=>selectionTrial(true));
test('TC-D7-002-C001 independent integer ranking for equal scores',()=>selectionTrial(false));

function obstruction(alignment,impulse=.01,newCollision=true){
  const blockerNormal={x:Math.sqrt(1-alignment**2),y:alignment};
  const end=time(0,1,.2), impact=time(0,1,.4);
  return [event(specimen.id),event(specimen.id,'end-contact',[],end),
    event('roof','begin-contact',[],newCollision?impact:time()),
    event('roof','post-solve',[{normal:blockerNormal,normalImpulse:impulse}],impact)];
}
for(const [index,alignment] of [-.501,-.5,-.499].entries()) test(
  `TC-D7-001-C00${index+2} blocking direction ${alignment}`,()=>{
    const control=springs.createSpringController([specimen]);
    const result=control.completeTick(frame({raw:obstruction(alignment),ballPosition:positionFrom(normal,.42)}));
    assert.equal(!!result.winner,alignment>-.5);
    assert.equal(control.state(specimen.id).phase,'WAIT_RELEASE');
    if (alignment===-.499) {
      for (const stale of [{tick:9},{runId:'previous-run'}]) {
        const old=obstruction(-.501).map(e=>e.id==='roof'?{...e,...stale}:e);
        const checked=springs.createSpringController([specimen]);
        assert(checked.completeTick(frame({raw:old,ballPosition:positionFrom(normal,.42)})).winner);
      }
    }
  });
for(const [index,distance] of [.25,.250001].entries()) test(
  `TC-D7-001-C00${index+5} outer separation ${distance}`,()=>{
    const control=springs.createSpringController([specimen]);
    const result=control.completeTick(frame({raw:[event(specimen.id),event(specimen.id,'end-contact',[],time(1))],
      ballPosition:positionFrom(normal,.32+distance)}));
    assert.equal(!!result.winner,distance<=.25);
  });
test('TC-D7-001 blocking supplementary impulse, continued contact and later timing',()=>{
  for(const [impulse,expected] of [[1e-6,true],[1.1e-6,false]]){
    const control=springs.createSpringController([specimen]);
    assert.equal(!!control.completeTick(frame({raw:obstruction(-.5,impulse)})).winner,expected);
  }
  const continued=springs.createSpringController([specimen]);
  const raw=obstruction(-.5,.01,false);
  assert(continued.completeTick(frame({raw})).winner);
  const used=springs.createSpringController([specimen]);
  assert.equal(used.completeTick(frame({raw,touchingAtEnd:[{id:'roof',normal:{x:Math.sqrt(.75),y:-.5}}]})).winner,null);
});

unit(23,2,'two actual eligible springs produce only one physical launch',()=>{
  const runtime=physics.createWorld();
  const p={x:4.8,y:3.6};
  try {
    const definitions=[-45,45].map((angleDeg,index)=>{
      const radians=angleDeg*Math.PI/180;
      const center={x:p.x-.321*Math.sin(radians),y:p.y-.321*Math.cos(radians)};
      const id='actual-'+index;
      const body=factory.createStaticBody(runtime.world,{...center,id,kind:'B',width:.72,height:.24,angleDeg});
      return {body,id,center,angleDeg,gridX:center.x/.24,gridY:(7.2-center.y)/.24};
    });
    const ball=factory.createBall(runtime.world,p);
    ball.setLinearVelocity({x:-.5,y:-2});
    const original=ball.setLinearVelocity;
    const calls=[];
    ball.setLinearVelocity=function(value){
      calls.push({x:value.x,y:value.y});
      return original.call(this,value);
    };
    const simulation=springs.createSpringSimulation(runtime,ball,definitions);
    const result=simulation.advanceTick();
    assert(result.advanced);
    assert.equal(new Set(result.eligible.map(candidate=>candidate.spring.id)).size,2);
    assert.equal(calls.length,1,'only one physical launch per tick');
    near(Math.hypot(calls[0].x,calls[0].y),9.5);
  }finally{physics.disposeWorld(runtime);}
});
