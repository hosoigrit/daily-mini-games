'use strict';
const assert=require('node:assert/strict');
const {before,test}=require('node:test');
const certified=require('../qa/fixtures/stages.json').layouts;
let app,stages,save,repo,machine,input,designs,identities;
before(async()=>{
  [app,stages,save,repo,machine,input]=await Promise.all([
    import('../src/app/controller.js'),import('../src/data/stage-definitions.js'),
    import('../src/storage/save-validator.js'),import('../src/storage/save-repository.js'),
    import('../src/app/state-machine.js'),import('../src/ui/input-controller.js'),
  ]);
  const all=stages.getStages();
  identities=Object.fromEntries(await Promise.all(all.map(async stage=>[stage.id,await stages.getStageIdentity(stage)])));
  designs=Object.fromEntries(all.map(stage=>[stage.id,{stage,identity:identities[stage.id]}]));
});

async function startup(id='04'){
  const original=save.createDefaultSave('a'.repeat(32));
  for(const stageId of ['01','02','03','04']){
    original.stages[stageId].progress={cleared:true,historicalBestStars:3};
    const layout=certified[stageId].baseline;
    original.stages[stageId].currentBest={compatibilityId:identities[stageId].compatibilityId,
      physicsRulesVersion:identities[stageId].physicsRulesVersion,usedParts:layout.length,stars:3,
      placements:save.encodePlacements(layout.map(([type,gridX,gridY,angleDeg],i)=>({id:'best-'+i,type,gridX,gridY,angleDeg})))};
  }
  original.stages['04'].draft={geometryId:identities['04'].geometryId,
    placements:[{id:'spring-qa',type:'spring',gridX:6,gridY:25,angleDeg:15}]};
  let raw=JSON.stringify(original),writes=0,token=1;
  const storage=repo.createSaveRepository({designs,epoch:()=> 'b'.repeat(32),
    storage:{getItem:()=>raw,setItem:(_,value)=>{raw=value;writes++;}},
    lock:{async acquire(){return {mode:'OWNER',generation:token};},isOwner:g=>g===token,current:()=>token,release(){token++;}},
  });
  await storage.start();
  let sequence=0;
  const frames=new Map();
  const game=app.createGameController({stages:stages.getStages(),identities,hints:{},storage,change(){},
    sound:{play(){},observe(){},end(){},start(){},begin(){},resume(){},stop(){},configure(){}},
    schedule:fn=>{frames.set(++sequence,fn);return sequence;},cancelFrame:id=>frames.delete(id)});
  game.dispatch({type:'enter'});game.dispatch({type:'stage',id});
  if(id==='04'){
    assert(game.dispatch({type:'add',id:'ramp-qa',partType:'R',gridX:5,gridY:7,angleDeg:0}));
    assert(game.dispatch({type:'select',id:'ramp-qa'}));
  }
  function inspect(){
    const state=game.state();
    return {screen:state.screen,editor:state.editor,time:state.current?.tick??0,
      physicallyObserved:state.snapshot!==null,raw,writes};
  }
  return {game,inspect,frames};
}

const edits=[
  {type:'add',id:'other-ramp',partType:'R',gridX:25,gridY:22,angleDeg:0},
  {type:'move',id:'ramp-qa',gridX:6,gridY:7},
  {type:'rotate',id:'ramp-qa',angleDeg:15},
  {type:'delete',id:'ramp-qa'},
  {type:'undo'},
  {type:'request-reset'},
  {type:'request-load-best'},
];
for(const [phase,offset] of [['RUNNING',2],['PAUSED',9]]){
  edits.forEach((command,index)=>test('TC-D6-005-C'+String(offset+index).padStart(3,'0')+' direct edit is blocked without side effects',async t=>{
    const control=await startup();
    assert(control.game.dispatch(command),'The DESIGN contrast must be valid');
    if(command.type.startsWith('request-'))assert(control.game.dispatch({type:'confirm'}));
    const experiment=await startup();
    assert(experiment.game.dispatch({type:'start'}));
    if(phase==='PAUSED')assert(experiment.game.dispatch({type:'pause'}));
    const before=experiment.inspect();
    assert.equal(before.screen,phase);
    assert.equal(experiment.game.dispatch(command),false);
    assert.deepEqual(experiment.inspect(),before);
    const result=experiment.game.dispatch({type:'abort'});
    assert(result);
    t.diagnostic(JSON.stringify({input:command,phase,actual:before}));
  }));
}

test('native timing clock does not accumulate inactive wall time',()=>{
  let ticks=0,reason=null;
  const clock=machine.createFrameClock({step:()=>{ticks++;return true;},pause:value=>{reason=value;}});
  assert.equal(clock.advance(0),0);
  assert.equal(clock.advance(120),5);
  assert.equal(clock.advance(250),5);
  assert.equal(clock.advance(500),0);
  assert.equal(ticks,10);assert.equal(reason,'更新間隔');
  assert.equal(clock.advance(5000),0);assert.equal(clock.advance(5017),1);
});

test('a hidden document discards tentative design only',async()=>{
  const {game,inspect}=await startup();
  const before=inspect();
  assert(game.dispatch({type:'drag',id:'ramp-qa'}));
  assert(game.dispatch({type:'preview',gridX:7,gridY:6}));
  game.hidden();
  const after=inspect();
  assert.equal(after.editor.selection.state,'SELECTED');
  assert.deepEqual(after.editor.placements,before.editor.placements);
  assert.equal(after.raw,before.raw);
  assert.equal(after.writes,before.writes);
});

test('part selection uses displayed distances and the specified 8px inclusion boundary',()=>{
  const fixture={id:'ramp',type:'R',gridX:20,gridY:15,angleDeg:0};
  const box={left:0,top:0,width:480,height:360};
  for(const [d,hit] of [[7,true],[8,true],[9,false]]){
    const result=input.hitPart({clientX:240+42+d,clientY:180},box,[fixture]);
    assert.equal(result?.id==='ramp',hit);
  }
});
