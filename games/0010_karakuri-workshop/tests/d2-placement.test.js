'use strict';

const assert = require('node:assert/strict');
const {before, test} = require('node:test');

let parts, g, placement, editor;
before(async () => {
  [parts, g, placement, editor] = await Promise.all([
    import('../src/data/part-definitions.js'), import('../src/domain/geometry.js'),
    import('../src/domain/placement-validator.js'), import('../src/domain/design-editor.js'),
  ]);
});

const numbers = n => String(n).padStart(3,'0');
const caseTest = (parent, caseIndex, title, run) => test(`TC-D2-${numbers(parent)}-C${numbers(caseIndex)} ${title}`,run);
const cases = {
  R: {parent:2, valid:[-60,-45,-30,-15,0,15,30,45,60], invalid:[-75,-61,-59,-1,1,59,61,75]},
  P: {parent:3, valid:[0], invalid:[-15,15], byCase:[-15,0,15]},
  B: {parent:4, valid:[-45,-30,-15,0,15,30,45], invalid:[-60,-46,-44,-1,1,44,46,60]},
  S: {parent:5, valid:[0], invalid:[-15,15], byCase:[-15,0,15]},
};
const sizes = {R:[1.68,.16], P:[1.2,.16], B:[.72,.24], S:[1.92,.16]};
const materials = {R:[.30,.05], P:[.50,.05], B:[.30,0], S:[.40,.05]};
const loc = (x,y,extra={}) => ({width:1.2,height:.16,x,y,...extra});
const placed = (id,type,gridX,gridY,angleDeg=0) => ({id,type,gridX,gridY,angleDeg});
const add = item => ({type:'add',id:item.id,partType:item.type,gridX:item.gridX,gridY:item.gridY,angleDeg:item.angleDeg});
const stage01 = {ball:{x:.72,y:6.84},goal:{x:4.56,y:2.88},inventory:{R:1},
  fixed:[placed('start-ramp','R',5,4,15)]};
const stage03 = {ball:{x:.96,y:6.84},goal:{x:6,y:2.4},inventory:{R:2,P:2},
  fixed:[placed('start-ramp','R',6,4,15)]};
const stage04 = {ball:{x:1.44,y:2.64},goal:{x:5.04,y:3.84},inventory:{R:2,P:1,B:1},
  fixed:[{id:'valley-wall',type:'W',x:3.12,y:1.68,width:.48,height:3.36}]};
const sol01 = placed('sol-ramp','R',11,9,30);
const sol03 = [placed('sol-platform','P',12,9),placed('sol-ramp','R',18,11,30)];

function check(stage, previous, command) {
  const result=editor.applyEditCommand(previous,stage,command);
  assert.equal(result.ok,true,JSON.stringify(command)+' '+result.reason);
  return result.state;
}

const saved = design => JSON.stringify(design.placements);
const facts = (stage, design) => ({
  placements:design.placements, inventory:placement.calculateInventory(stage,design.placements),
  history:design.history, revision:design.revision, saved:saved(design),
});

caseTest(1,1,'approved part properties',()=>{
  for (const type of ['R','P','B','S']) {
    const {width,height,angles,bodyType,material,joint} = parts.getPartDefinition(type);
    assert.deepEqual([width,height], sizes[type]);
    assert.deepEqual(angles, cases[type].valid);
    assert.equal(bodyType, type==='S'?'dynamic':'static');
    assert.deepEqual([material.friction,material.restitution],materials[type]);
    if(type==='S') assert.deepEqual(joint,{type:'revolute',limitDegrees:30,motor:false,massRatio:1.5,angularDamping:1.2});
    else assert.equal(joint,null);
  }
});
for(const [type,{parent,valid,invalid,byCase=[...invalid,...valid]}] of Object.entries(cases)){
  caseTest(parent,1,'allowed set only',()=>{
    const actual=Array.from({length:181},(_,index)=>index-90).filter(angle=>g.validateAngle(type,angle));
    assert.deepEqual(actual,valid);
    assert(invalid.every(angle=>!g.validateAngle(type,angle)));
  });
  byCase.forEach((angle,index)=>caseTest(parent,index+2,`${type} ${angle}°`,()=>{
    assert.equal(g.validateAngle(type,angle),valid.includes(angle));
  }));
}
const snapping=[[11,0],[12,24],[13,24],[36,48]];
caseTest(6,1,'coordinate snapping',()=>{
  assert.deepEqual(snapping.map(([x])=>g.snapToGrid(x)),[0,24,24,48]);
});
snapping.forEach(([input,expected],i)=>caseTest(6,i+2,`snap ${input}`,()=>assert.equal(g.snapToGrid(input),expected)));

caseTest(7,1,'outer silhouette within board',()=>{
  for(const [x,y,allowed] of [[0,3.6,false],[9.6,3.6,false],[4.8,0,false],[4.8,7.2,false],
   [4.8,3.6,true],[.6,3.6,true],[9,3.6,true],[4.8,.08,true],[4.8,7.12,true]]){
    assert.equal(g.insideBoard(g.getOrientedRectangle(loc(x,y))),allowed,`${x},${y}`);
  }
});

// The controller fixtures use these corner-and-edge calculations to choose an input
// independently of the product's centre/axis projection implementation.
function corners(item) {
  const x=item.x??item.gridX*.24, y=item.y??(30-item.gridY)*.24;
  const [w,h]=sizes[item.type]??[item.width,item.height];
  const a=-(item.angleDeg??0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]
    .map(([dx,dy])=>[x+dx*c-dy*s,y+dx*s+dy*c]);
}
function edges(vertices) {
  return vertices.map((p,i)=>[p,vertices[(i+1)%vertices.length]]);
}
function intersect(a,b) {
  return [...edges(a),...edges(b)].every(([[x,y],[xx,yy]])=>{
    const length=Math.hypot(xx-x,yy-y);
    const ax=(y-yy)/length, ay=(xx-x)/length;
    const p=a.map(([u,v])=>ax*u+ay*v), q=b.map(([u,v])=>ax*u+ay*v);
    return Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q))>1e-6;
  });
}
function circleIntersects(vertices, {x,y}) {
  let inside=true;
  let distance=Infinity;
  for(const [[u,v],[a,b]] of edges(vertices)){
    const dx=a-u, dy=b-v;
    inside &&= dx*(y-v)-dy*(x-u)>=0;
    const t=Math.max(0,Math.min(1,((x-u)*dx+(y-v)*dy)/(dx*dx+dy*dy)));
    distance=Math.min(distance,Math.hypot(x-u-t*dx,y-v-t*dy));
  }
  return inside||distance<.2-1e-6;
}
function legal(stage, others, item) {
  const polygon=corners(item);
  const blockers=[...stage.fixed,...others,{...stage.goal,y:stage.goal.y+.32,width:1.52,height:.96}];
  return polygon.every(([x,y])=>x>=-1e-6&&x<=9.6+1e-6&&y>=-1e-6&&y<=7.2+1e-6)
    && !circleIntersects(polygon,stage.ball) && !blockers.some(blocker=>intersect(polygon,corners(blocker)));
}
function neighbor(stage, item) {
  const {gridX:x,gridY:y}=item;
  const candidates=[[x-1,y],[x,y-1],[x,y+1],[x+1,y]].map(([gridX,gridY])=>({...item,gridX,gridY}));
  return candidates.find(part=>legal(stage,[],part));
}

caseTest(8,1,'second geometrically legal ramp rejected for inventory',()=>{
  const stage=stage01;
  let second;
  outer: for(let x=0;x<=40;x++) for(let y=0;y<=30;y++) for(const angle of cases.R.valid){
    const candidate=placed('extra','R',x,y,angle);
    if(legal(stage,[sol01],candidate)){second=candidate;break outer;}
  }
  assert(second);
  assert.equal(placement.validatePlacement(stage,[],second).ok,true);
  const design=check(stage,editor.createDesignEditor(),add(sol01));
  assert.equal(placement.calculateInventory(stage,design.placements).R,0);
  const result=editor.applyEditCommand(design,stage,add(second));
  assert.equal(result.reason,'INVENTORY');
  assert.strictEqual(result.state,design);
  assert.deepEqual(facts(stage,result.state),facts(stage,design));
});
caseTest(9,1,'fixed ramp unavailable to edit, move, rotate, delete',()=>{
  const fixed=structuredClone(stage01.fixed);
  const id=fixed[0].id;
  for(const command of [{type:'move',gridX:6,gridY:4},{type:'rotate',angleDeg:30},{type:'delete'}]){
    const design=editor.createDesignEditor();
    const data={...design,selection:{state:'SELECTED',id}};
    const result=editor.applyEditCommand(data,stage01,{...command,id});
    assert.equal(result.ok,false,'fixed edit was applied');
    assert.equal(result.reason,'FIXED_PART');
    assert.strictEqual(result.state,data);
    assert.deepEqual(stage01.fixed,fixed);
  }
});

caseTest(10,1,'rectangle boundaries may touch',()=>{
  const [a,b]=[2.4,3.6].map(x=>g.getOrientedRectangle(loc(x,2.4)));
  assert.equal(g.intersectRectangles(a,b),false);
});
caseTest(11,1,'one centimetre rectangle overlap rejected',()=>{
  const [a,b]=[2.4,3.59].map(x=>g.getOrientedRectangle(loc(x,2.4)));
  assert.equal(g.intersectRectangles(a,b),true,'interior overlap .01m');
});
caseTest(12,1,'overlapping AABB and disjoint oriented rectangles',()=>{
  const a=g.getOrientedRectangle(loc(3,3,{width:1.68,angle:Math.PI/4}));
  const b=g.getOrientedRectangle(loc(3+.3/Math.sqrt(2),3-.3/Math.sqrt(2),{width:1.68,angle:Math.PI/4}));
  assert(a.right>b.left && a.bottom<b.top);
  assert.equal(g.intersectRectangles(a,b),false);
});
caseTest(13,1,'circle tangent and one centimetre overlap',()=>{
  const obstacle=g.getOrientedRectangle(loc(2.4,2.4));
  assert.equal(g.intersectCircleRectangle({x:2.4,y:2.68,radius:.2},obstacle),false);
  assert.equal(g.intersectCircleRectangle({x:2.4,y:2.67,radius:.2},obstacle),true);
});
caseTest(14,1,'goal protection interior versus boundary',()=>{
  const goal=g.getGoalProtection({x:4.8,y:2.4});
  assert.equal(g.intersectRectangles(goal,g.getOrientedRectangle(loc(4.8,3))),true);
  assert.equal(g.intersectRectangles(goal,g.getOrientedRectangle(loc(6.16,3))),false);
});
const seesawCenter={x:4.8,y:3.6};
function testSweep(obstacle){
  assert.equal(g.intersectRectangles(g.getOrientedRectangle({...seesawCenter,width:1.92,height:.16}),obstacle),false);
  assert(g.getSweptEnvelope(seesawCenter).some(shape=>g.intersectRectangles(shape,obstacle)),'overlap in swept envelope');
}
caseTest(31,1,'reservation outside the initial plate',()=>{
  testSweep(g.getOrientedRectangle({x:5.52,y:4.08,width:.16,height:.16}));
});
caseTest(32,1,'reservation between sampled angles',()=>{
  const a=12.5*Math.PI/180;
  const x=4.8+.96*Math.cos(a)-.08*Math.sin(a), y=3.6+.96*Math.sin(a)+.08*Math.cos(a);
  const tiny=g.getOrientedRectangle({x,y,width:.002,height:.002});
  const exact=g.getOrientedRectangle({...seesawCenter,width:1.92,height:.16,angle:a});
  assert.equal(g.intersectRectangles(exact,tiny),true);
  testSweep(tiny);
});
caseTest(33,1,'two swept reserve envelopes may conflict',()=>{
  const a={x:3,y:3.6},b={x:3,y:4.1},shape={width:1.92,height:.16};
  assert.equal(g.intersectRectangles(g.getOrientedRectangle({...a,...shape}),g.getOrientedRectangle({...b,...shape})),false);
  assert(g.getSweptEnvelope(a).some(x=>g.getSweptEnvelope(b).some(y=>g.intersectRectangles(x,y))));
});
caseTest(34,1,'legal placement independent of order',()=>{
  for(const pair of [sol03,[...sol03].reverse()]){
    assert(legal(stage03,[],pair[0])&&legal(stage03,[pair[0]],pair[1]));
    assert.equal(placement.validatePlacement(stage03,[],pair[0]).ok,true);
    assert.equal(placement.validatePlacement(stage03,[pair[0]],pair[1]).ok,true);
  }
});
caseTest(34,2,'editor yields same canonical layout and inventory in either order',()=>{
  const a=sol03.reduce((s,p)=>check(stage03,s,add(p)),editor.createDesignEditor());
  const b=[...sol03].reverse().reduce((s,p)=>check(stage03,s,add(p)),editor.createDesignEditor());
  assert.deepEqual(editor.canonicalDesign(a.placements),editor.canonicalDesign(b.placements));
  assert.deepEqual(placement.calculateInventory(stage03,a.placements),{R:1,P:1,B:0,S:0});
  assert.deepEqual(placement.calculateInventory(stage03,a.placements),placement.calculateInventory(stage03,b.placements));
});
caseTest(36,1,'draft rotations commit one placement',()=>{
  const base=editor.createDesignEditor();
  let d=check(stage01,base,{type:'new-part',partType:'R'});
  for(const angleDeg of [15,30]){
    d=check(stage01,d,{type:'rotate-draft',angleDeg});
    assert.deepEqual(facts(stage01,d),facts(stage01,base));
  }
  d=check(stage01,d,{type:'commit-draft',id:sol01.id,gridX:11,gridY:9});
  assert.deepEqual(d.placements,[sol01]);
  assert.deepEqual(d.history,[[]]);
  assert.equal(d.revision,1);
  assert.equal(placement.calculateInventory(stage01,d.placements).R,0);
});
caseTest(37,1,'invalid move and drag interruption preserve committed state',()=>{
  const stage=stage03;
  const base=sol03.reduce((s,p)=>check(stage,s,add(p)),editor.createDesignEditor());
  const [platform,ramp]=sol03;
  let d=check(stage,base,{type:'drag',id:ramp.id});
  const bad=editor.applyEditCommand(d,stage,{type:'commit-draft',gridX:platform.gridX,gridY:platform.gridY});
  assert.equal(bad.reason,'PLACEMENT_OVERLAP');
  assert.deepEqual(facts(stage,bad.state),facts(stage,base));
  const target=neighbor(stage,ramp);
  assert(target&&legal(stage,[platform],target));
  for(const type of ['cancel','orientation-change']){
    d=check(stage,base,{type:'drag',id:ramp.id});
    d=check(stage,d,{type:'preview',gridX:target.gridX,gridY:target.gridY});
    d=check(stage,d,{type});
    assert.equal(d.selection.state,'SELECTED');
    assert.deepEqual(facts(stage,d),facts(stage,base));
  }
});
caseTest(38,1,'move rotate delete and four undo snapshots',()=>{
  const stage=stage04, initial=placed('r','R',6,21,-30);
  assert(legal(stage,[],initial));
  const moved=neighbor(stage,initial);
  assert(moved);
  const rotated=[-45,-15].map(angleDeg=>({...moved,angleDeg})).find(x=>legal(stage,[],x));
  assert(rotated);
  let d=editor.createDesignEditor();
  const operations=[add(initial),{type:'move',id:'r',gridX:moved.gridX,gridY:moved.gridY},
    {type:'rotate',id:'r',angleDeg:rotated.angleDeg},{type:'delete',id:'r'}];
  const forward=[[initial],[moved],[rotated],[]];
  for(const [index,op] of operations.entries()){
    d=check(stage,d,op);
    assert.deepEqual(d.placements,forward[index]);
    assert.equal(placement.calculateInventory(stage,d.placements).R,2-forward[index].length);
  }
  for(const expected of [[rotated],[moved],[initial],[]]){
    d=check(stage,d,{type:'undo'});
    assert.deepEqual(d.placements,expected);
    assert.equal(placement.calculateInventory(stage,d.placements).R,2-expected.length);
  }
  assert.equal(d.history.length,0);
});
caseTest(39,1,'history retains the last fifty confirmed commands',()=>{
  const stage=stage01;
  const alternate=neighbor(stage,sol01);
  assert(alternate);
  let d=check(stage,editor.createDesignEditor(),add(sol01));
  for(let i=0;i<50;i++){
    const x=i%2===0?alternate:sol01;
    d=check(stage,d,{type:'move',id:sol01.id,gridX:x.gridX,gridY:x.gridY});
  }
  assert.equal(d.history.length,50);
  const invalid=editor.applyEditCommand(d,stage,{type:'rotate',id:sol01.id,angleDeg:999});
  assert.equal(invalid.ok,false);
  assert.strictEqual(invalid.state,d);
  for(let i=0;i<50;i++){
    d=check(stage,d,{type:'undo'});
    assert.deepEqual(d.placements,[i%2===0?alternate:sol01]);
    assert.equal(d.history.length,49-i);
  }
  assert.deepEqual(d.placements,[sol01]);
  assert.equal(editor.applyEditCommand(d,stage,{type:'undo'}).reason,'EMPTY_UNDO');
});
caseTest(40,1,'confirmation reset and best load retain the required state',()=>{
  const stage=stage01, alt=neighbor(stage,sol01);
  assert(alt);
  const fixture={placements:[sol01],best:[alt],progress:{cleared:true,stars:3},
    trajectory:[[4,5]],history:[[],[alt]]};
  const base=editor.createDesignEditor(fixture);
  for(const type of ['request-reset','request-load-best']){
    const requesting=check(stage,base,{type});
    const cancelled=check(stage,requesting,{type:'cancel'});
    assert.deepEqual(cancelled,base);
  }
  const reset=check(stage,check(stage,base,{type:'request-reset'}),{type:'confirm'});
  assert.deepEqual([reset.placements,reset.history,reset.trajectory,reset.progress],[[],[],null,fixture.progress]);
  const loaded=check(stage,check(stage,base,{type:'request-load-best'}),{type:'confirm'});
  assert.deepEqual(loaded.placements,[alt]);
  assert.equal(loaded.history.length,3);
  const undone=check(stage,loaded,{type:'undo'});
  assert.deepEqual(undone.placements,[sol01]);
});
