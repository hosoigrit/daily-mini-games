import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTutorialController} from '../src/app/tutorial-controller.js';
import {tutorialBoard} from '../src/data/tutorial-definitions.js';
import {createDefaultSave} from '../src/storage/save-validator.js';

function harness({save=true}={}) {
  const data=createDefaultSave('0'.repeat(32),2);
  const calls=[];
  const storage={read:()=>({generation:1,data}),commitTutorial(mark,generation){
    calls.push([structuredClone(mark),generation]);
    if(save)data.tutorial=structuredClone(mark);
    return save;
  }};
  const controller=createTutorialController({storage,change(){},schedule(){return 1;},cancelFrame(){},
    sound:{stop(){},play(){}},makeExperiment(){assert.fail('No physical run in control tests');}});
  return {data,calls,controller,send:(type,extra)=>controller.dispatch({type,...extra}),read:()=>controller.state()};
}
const stepOf = state => state.tutorial.step;
test('CR010-TUT-01/02/03 progress only on focus return, accepted R draft, and exact committed placement',()=>{
  const h=harness();
  assert.equal(h.controller.start(),true);
  assert.equal(h.send('start'),false);
  assert.equal(stepOf(h.read()),1);
  assert.equal(h.send('tutorial-help-returned'),true);
  assert.equal(h.send('new-part',{partType:'P'}),true);
  assert.equal(stepOf(h.read()),2);
  assert.equal(h.send('new-part',{partType:'R'}),true);
  assert.equal(stepOf(h.read()),3);
  assert.equal(h.read().editor.placements.length,0);
  assert.equal(h.read().editor.history.length,0);
  h.send('preview',{gridX:11,gridY:10});
  h.send('cancel');
  assert.equal(stepOf(h.read()),3);
  h.send('new-part',{partType:'R'});
  h.send('commit-draft',{id:'person-1',gridX:11,gridY:10});
  assert.equal(stepOf(h.read()),4);
  assert.equal(h.data.tutorial.nextStep,4);
});
test('CR010-TUT-04/05/06 same-id movement, rotation, removal, and undo use the production editor',()=>{
  const h=harness();
  h.controller.start(4);
  const id=h.read().editor.placements[0].id;
  assert.equal(h.send('move',{source:'coordinate',id,gridX:12,gridY:10}),true);
  h.send('move',{id,gridX:11,gridY:10});
  h.send('move',{source:'direction',id,gridX:12,gridY:10});
  assert.equal(stepOf(h.read()),4);
  h.send('move',{source:'coordinate',id,gridX:13,gridY:10});
  assert.equal(stepOf(h.read()),5);
  h.send('rotate',{id,angleDeg:-15});
  assert.equal(stepOf(h.read()),5);
  h.send('rotate',{id,angleDeg:0});
  h.send('rotate',{id,angleDeg:15});
  assert.equal(stepOf(h.read()),6);
  h.send('delete',{id});
  assert.equal(h.read().editor.placements.length,0);
  h.send('undo');
  assert.equal(stepOf(h.read()),7);
  assert.equal(h.read().editor.placements.length,0);
});
test('CR010-TUT-13/14/15 deferral is temporary, skip is persisted, and review does not overwrite graduation',()=>{
  const h=harness();
  h.controller.defer();
  assert.equal(h.controller.shown(),true);
  assert.equal(h.calls.length,0);
  assert.equal(h.controller.skipIntro(),true);
  assert.deepEqual(h.data.tutorial,{curriculumVersion:1,state:'skipped',nextStep:1});
  h.data.tutorial={curriculumVersion:1,state:'completed',nextStep:13};
  assert.equal(h.controller.start(1),true);
  assert.equal(h.read().tutorial.review,true);
  h.send('tutorial-help-returned');
  h.controller.leave(true);
  assert.equal(h.calls.length,1);
  assert.equal(h.data.tutorial.state,'completed');
});
test('CR010-TUT-16/17 temporary steps are distinct from stored progress',()=>{
  const h=harness({save:false});
  h.controller.start();
  h.send('tutorial-help-returned');
  assert.equal(stepOf(h.read()),2);
  assert.equal(h.read().tutorial.saved,false);
  assert.equal(h.data.tutorial.state,'unseen');
});
test('CR010-TUT practice boards never use a normal stage ID or a solution as their starting layout',()=>{
  for(let step=1;step<=12;step++){
    const setup=tutorialBoard(step);
    assert.equal(setup.stage.id,'00');
    const h=harness();
    assert(h.controller.start(step));
    assert.equal(h.read().editor.placements.length,setup.prep.length);
  }
  assert.deepEqual(tutorialBoard(12).objective,{B:1,S:1});
  assert.deepEqual(tutorialBoard(12).prep,[]);
});
