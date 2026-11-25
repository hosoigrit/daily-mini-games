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

async function audioLab(){
  const {createAudioController}=await import('../src/presentation/audio-controller.js');
  const events=[],masters=[];
  const context={state:'running',currentTime:0,destination:{},
    createGain(){
      const gain={value:0,setValueAtTime(value){gain.value=value;},linearRampToValueAtTime(value){gain.value=value;},cancelAndHoldAtTime(){}};
      const node={gain,connect(target){if(target===context.destination)masters.push(gain);},disconnect(){}};
      return node;
    },
    createOscillator(){
      const data={starts:[],stops:[],frequencies:[]};
      const tone={frequency:{setValueAtTime:f=>data.frequencies.push(f),linearRampToValueAtTime:f=>data.frequencies.push(f)},
        start(at){data.starts.push(at);events.push(data);},stop(at){data.stops.push(at);},connect(){},disconnect(){}};
      return tone;
    },
  };
  const sound=createAudioController(()=>context);
  await sound.gesture();
  return {sound,context,events,masters};
}
const frameOverrides=props=>({usage:{frames:[],raw:[],state:{usedIds:[]},activation:null,...props?.usage},
 presentation:{bodyObservations:[],contacts:[],...props?.presentation}});
test('TC-D6-037-C001 actual normalized contact input crosses J/m and the real clock throttle',async()=>{
  const {sound,context,events}=await audioLab();
  sound.begin('R');
  const collision=amount=>sound.observe('R',frameOverrides({presentation:{
    contacts:[{event:'post-solve',points:[{normalImpulse:.2*amount}]}]}}));
  collision(.149);assert.equal(events.length,0);
  collision(.15);assert.equal(events.length,1);
  context.currentTime=.050;collision(.151);assert.equal(events.length,1);
  context.currentTime=.100;collision(.151);assert.equal(events.length,2);
  assert(events.every(e=>e.frequencies[0]===450));
});
test('TC-D6-038-C001 no spring tone without a selected live activation',async()=>{
  const {sound,events}=await audioLab();
  sound.begin('R');
  sound.observe('R',frameOverrides({usage:{raw:[{event:'pre-solve',id:'candidate'}]}}));
  sound.observe('old',frameOverrides({usage:{activation:{springId:'winner'}}}));
  assert.equal(events.length,0);
  sound.observe('R',frameOverrides({usage:{activation:{springId:'winner'}}}));
  assert.deepEqual(events.map(e=>e.frequencies),[[220,780]]);
});
test('TC-D6-039-C001 qualified same-episode tilt boundaries and 250 ms separation',async()=>{
  const {sound,context,events}=await audioLab();sound.begin('R');
  const observe=(degrees,upper=true)=>sound.observe('R',frameOverrides({
    usage:{frames:[{qualified:upper?[{id:'S'}]:[]}]},
    presentation:{bodyObservations:[{phase:'after-step-before-limit',substep:0,bodies:[{id:'S',kind:'S',angle:degrees*Math.PI/180}]}]}}));
  observe(0);observe(4.9);assert.equal(events.length,0);
  observe(5);observe(5.1);assert.equal(events.length,1);
  context.currentTime=.100;observe(10);assert.equal(events.length,1);
  context.currentTime=.250;observe(15);assert.equal(events.length,2);
  observe(16,false);context.currentTime=.600;observe(31);assert.equal(events.length,2);
});
test('TC-D6-040-C001 terminal audio is once per run and newly earned stars only',async()=>{
  const {sound,events}=await audioLab();
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  sound.begin('A');
  sound.end({runId:'A',status:'FAILED'});sound.end({runId:'A',status:'FAILED'});
  assert.equal(events.filter(e=>e.frequencies[0]===440).length,1);
  for(const [id,newStars] of [['B',1],['C',2],['D',0]]){
    const earlier=events.filter(e=>e.frequencies[0]===880).length;
    sound.begin(id);
    sound.end({runId:id,status:'CLEARED',newStars});sound.end({runId:id,status:'CLEARED',newStars});
    await wait(300);
    assert.equal(events.filter(e=>e.frequencies[0]===880).length-earlier,newStars);
  }
});
test('TC-D6-043-C001 stop and old-run notifications cannot add sound',async()=>{
  const {sound,events}=await audioLab();
  sound.begin('A');sound.stop();
  const activation=frameOverrides({usage:{activation:{springId:'stale'}}});
  sound.observe('A',activation);
  sound.begin('B');sound.observe('A',activation);assert.equal(events.length,0);
  sound.observe('B',activation);assert.equal(events.length,1);
});
test('TC-D6-044-C001 unavailable audio context and failed resume warn without throwing',async()=>{
  const {createAudioController}=await import('../src/presentation/audio-controller.js');
  const failures=[()=>{throw new Error('constructor unavailable');},()=>({state:'suspended',currentTime:0,
    createGain:()=>({connect(){},gain:{setValueAtTime(){}}}),
    resume:()=>Promise.reject(new Error('resume failed'))})];
  for(const make of failures){
    const sound=createAudioController(make);
    await sound.gesture();assert.equal(sound.unavailable(),true);
    assert.equal(sound.play('clear'),false);
  }
});
test('TC-D7-010-C001 four voice ceiling, priority and shared immediate master gain',async()=>{
  const {sound,events,masters,context}=await audioLab();
  for(let i=0;i<4;i++){context.currentTime+=.01;assert(sound.play('place'));}
  assert.equal(sound.play('place'),false);
  assert(sound.play('clear'));assert.equal(events.length,5);
  assert(events[0].stops.length>1);
  sound.configure({muted:false,volume:1});assert.equal(masters[0].value,1);
  sound.configure({muted:false,volume:.7});assert.equal(masters[0].value,.7);
  sound.configure({muted:true,volume:.7});assert.equal(masters[0].value,0);
  assert.equal(sound.play('clear'),false);
  assert(events.filter(e=>e.stops.length>1).length>=4);
});
