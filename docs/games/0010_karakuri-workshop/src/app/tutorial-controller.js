import {lessons, tutorialBoard} from '../data/tutorial-definitions.js';
import {createStageExperiment} from '../data/stage-definitions.js';
import {applyEditCommand, createDesignEditor} from '../domain/design-editor.js';
import {createTrajectoryRecorder} from '../physics/trajectory-recorder.js';
import {createFrameClock, isEditCommand} from './state-machine.js';

const tuple = part => `${part.type}:${part.gridX}:${part.gridY}:${part.angleDeg}`;
const lessonState = (state, nextStep) => ({curriculumVersion:1,state,nextStep});

export function createTutorialController({storage, sound, change,
  schedule, cancelFrame, makeExperiment = createStageExperiment}) {
  let screen = 'DESIGN';
  let step = 1;
  let active = false;
  let review = false;
  let stage, objective, editor, teaching, run, frame, current, snapshot, previousTrajectory;
  let runSerial = 0;
  let frameEpoch = 0;
  let shown = false;
  let showTrail = false;
  let notice = '';
  let pauseReason = '';
  let saved = false;
  let marks = {};
  const clock = createFrameClock({step:advanceWorld,pause});

  function persist(mark) {
    if (review) return true;
    return storage.commitTutorial?.(mark,storage.read().generation) ?? false;
  }
  function dispose() {
    frameEpoch++;
    const prior = run;
    run = null;
    if (frame !== undefined) {
      cancelFrame(frame);
      frame = undefined;
    }
    clock.reset();
    prior?.experiment.dispose();
  }
  function load(next) {
    dispose();
    sound.stop();
    step = next;
    const board = tutorialBoard(step);
    ({stage,objective} = board);
    teaching = new Set(board.prep.map(part=>part.id));
    editor = createDesignEditor();
    for (const {type,id,gridX,gridY,angleDeg} of board.prep) {
      const placed=applyEditCommand(editor,stage,{type:'add',partType:type,id,gridX,gridY,angleDeg});
      if (!placed.ok) throw new Error('練習の準備配置が合法ではありません。');
      editor=placed.state;
    }
    editor=createDesignEditor({placements:editor.placements});
    marks = {};
    screen = 'DESIGN';
    current = snapshot = previousTrajectory = null;
    showTrail = false;
    pauseReason = '';
    notice = '';
  }
  function start(next = 1) {
    review=storage.read().data.tutorial?.state==='completed';
    if (!Number.isInteger(next) || next < 1 || next > 12) return false;
    load(next);
    active = true;
    shown = true;
    saved = persist(lessonState('inProgress',step));
    return true;
  }
  function advance() {
    if (step === 12) {
      dispose();
      sound.stop();
      screen='CLEARED';
      saved=persist(lessonState('completed',13));
      marks.graduated=true;
      return;
    }
    load(step+1);
    saved=persist(lessonState('inProgress',step));
  }
  function scheduleFrame() {
    const source=run;
    const epoch=frameEpoch;
    frame=schedule(now=>{
      if(run===source&&frameEpoch===epoch)animate(now);
    });
  }
  function animate(now) {
    frame=undefined;
    if (!active||screen!=='RUNNING')return;
    clock.advance(now);
    change();
    if(screen==='RUNNING')scheduleFrame();
  }
  function startWorld() {
    if (step < 7 || screen!=='DESIGN'||editor.selection.state==='CONFIRMING') return false;
    const id = `karakuri-st00-${++runSerial}`;
    editor = applyEditCommand(editor,stage,{type:'cancel'}).state;
    const generation = storage.read().generation;
    const placements = new Map(editor.placements.map(part=>[tuple(part),part]));
    const experiment = makeExperiment(stage,editor.placements,{runId:id,observePresentation:true,observe:row=>{
      if (run?.id===id) snapshot=row;
    }});
    const owned=new Map();
    for(const part of experiment.placements){
      const original=placements.get(tuple(part));
      if (!original) {
        experiment.dispose();
        return false;
      }
      if (!teaching.has(original.id))owned.set(part.id,part.type);
    }
    run={id,generation,experiment,owned,emptyStart:editor.placements.length===0,
      trail:createTrajectoryRecorder(id,stage.ball),resumed:false,manualPause:0};
    current=snapshot=null;
    screen='RUNNING';
    clock.reset();
    sound.begin(id);
    scheduleFrame();
    return true;
  }
  function pause(reason='手動') {
    if (screen!=='RUNNING'||!run)return false;
    if(reason==='手動'&&current?.tick>0)run.manualPause=current.tick;
    frameEpoch++;
    if(frame!==undefined)cancelFrame(frame);
    frame=undefined;
    clock.reset();
    sound.stop();
    pauseReason=reason;
    screen='PAUSED';
    return true;
  }
  function resume() {
    if (screen!=='PAUSED'||!run)return false;
    run.resumed=true;
    clock.reset();
    sound.resume(run.id);
    screen='RUNNING';
    scheduleFrame();
    return true;
  }
  function playerMet(next, source) {
    const counts={};
    for (const id of new Set(next.usage?.state.usedIds??[])) {
      const type=source.owned.get(id);
      if (type)counts[type]=(counts[type]??0)+1;
    }
    return Object.entries(objective).every(([type,min])=>(counts[type]??0)>=min);
  }
  function advanceWorld() {
    const source=run;
    if(!source||screen!=='RUNNING')return false;
    if(source.generation!==storage.read().generation) {
      load(step);
      notice='保存権限が変わったため、この実験を終了しました。';
      return false;
    }
    const next=source.experiment.step();
    if(!next||run!==source)return false;
    current=next;
    if(next.usage)sound.observe(source.id,next);
    if(!next.error)source.trail.sample(next.tick,next.position);
    if(step===7&&next.status==='RUNNING'&&!next.error&&source.resumed&&source.manualPause>0&&next.tick>source.manualPause) {
      advance();
      return false;
    }
    if(next.status==='RUNNING')return true;
    previousTrajectory=source.trail.finish(next.tick,next.position,next.status);
    dispose();
    sound.stop();
    screen=next.status==='CLEARED'?'CLEARED':next.status==='FAILED'?'FAILED':'ERROR';
    if (step===8 && next.status==='FAILED' && source.emptyStart) marks.emptyFailure=source.id;
    if (next.status==='CLEARED' && playerMet(next,source)
      && (step>=9 || step===8&&marks.emptyFailure&&marks.trailSeen===marks.emptyFailure&&marks.emptyFailure!==source.id)) {
      advance();
    } else if(next.status==='CLEARED')notice='講座の条件を確認して、再設計してください。';
    return false;
  }
  function edit(command) {
    if(screen!=='DESIGN'||command.type==='request-load-best')return false;
    const before=editor;
    const outcome=applyEditCommand(editor,stage,command);
    editor=outcome.state;
    if(!outcome.ok){
      notice='配置できません。盤面の端、他のパーツ、ゴールとの重なりを確認してください。';
      return false;
    }
    const previous=before.placements;
    const placed=editor.placements;
    const committed=editor.revision===before.revision+1;
    if(step===2&&command.type==='new-part'&&editor.selection.state==='NEW_PART'
      &&editor.selection.draft?.type==='R'&&placed.length===previous.length&&editor.history.length===before.history.length) {
      const draft=editor.selection;
      advance();
      editor={...editor,selection:draft};
      return true;
    }
    if (!committed) return true;
    if(step===3&&placed.length===previous.length+1&&editor.history.length===before.history.length+1
      &&placed.some(part=>tuple(part)==='R:11:10:0'&&!previous.some(old=>old.id===part.id)))advance();
    else if(step===4) {
      const id=command.id??before.selection.id;
      const old=previous.find(part=>part.id===id);
      const part=placed.find(item=>item.id===id);
      if(old&&part&&old.type==='R'&&part.gridY===10) {
        if(tuple(old)==='R:11:10:0'&&tuple(part)==='R:12:10:0'&&command.source==='direction')marks.moved=id;
        if(marks.moved===id&&tuple(old)==='R:12:10:0'&&tuple(part)==='R:13:10:0'
          && (before.selection.state==='DRAGGING'||command.source==='coordinate'))advance();
      }
    } else if(step===5&&command.type==='rotate') {
      const id=command.id??before.selection.id;
      if(previous.some(part=>part.id===id&&tuple(part)==='R:13:10:0')
        &&placed.some(part=>part.id===id&&tuple(part)==='R:13:10:15'))advance();
    } else if(step===6) {
      if(command.type==='delete'){
        const original=previous.find(part=>part.id===command.id);
        if(original&&tuple(original)==='R:13:10:15'&&!placed.some(part=>part.id===original.id))marks.deleted=original.id;
      }
      if(command.type==='undo'&&placed.some(part=>part.id===marks.deleted&&tuple(part)==='R:13:10:15'))advance();
    }
    if(command.type==='add'||command.type==='commit-draft')sound.play('place');
    if(command.type==='rotate')sound.play('rotate');
    return true;
  }
  function dispatch(command) {
    if (!active) return false;
    notice='';
    if(isEditCommand(command)) return edit(command);
    switch(command.type) {
      case 'tutorial-help-returned':
        if(step!==1||screen!=='DESIGN')return false;
        advance();return true;
      case 'start':return startWorld();
      case 'pause':return pause();
      case 'resume':return resume();
      case 'abort':
        if(!run)return false;
        dispose();sound.stop();screen='DESIGN';current=snapshot=null;return true;
      case 'redesign':
        if(!['FAILED','ERROR','CLEARED'].includes(screen)||marks.graduated)return false;
        screen='DESIGN';current=snapshot=null;return true;
      case 'clear-selection':
        if(screen!=='DESIGN')return false;
        editor={...editor,selection:{state:'IDLE'}};return true;
      case 'toggle-trail':
        showTrail=!showTrail;
        if(step===8&&showTrail&&!['RUNNING','PAUSED'].includes(screen)&&previousTrajectory?.points.length>1
          &&previousTrajectory.runId===marks.emptyFailure)marks.trailSeen=marks.emptyFailure;
        return true;
      default:return false;
    }
  }
  function leave(skip=false) {
    const mark=storage.read().data.tutorial;
    if(skip&&!review&&!marks.graduated&&mark?.state!=='completed')saved=persist(lessonState('skipped',step));
    dispose();
    sound.stop();
    active=false;
    shown=true;
    return saved;
  }
  return {
    active:()=>active, shown:()=>shown,
    defer(){shown=true;},
    skipIntro(){
      shown=true;
      const mark=storage.read().data.tutorial;
      return mark?.state==='completed'||persist(lessonState('skipped',mark?.nextStep??1));
    },
    start, dispatch, leave,
    hide(reason) {
      if(screen==='DESIGN')editor=applyEditCommand(editor,stage,{type:'orientation-change'}).state;
      pause(reason);
    },
    detach(){
      if(!active||marks.graduated)return;
      load(step);
      notice='実験を終了しました。確定済みのステップから再開できます。';
    },
    restore() {
      if(!active)return;
      const next=storage.read().data.tutorial?.nextStep;
      if(marks.graduated&&next===13)return;
      load(!review&&next>=1&&next<=12?next:step);
      saved=!review&&next===step;
    },
    state:()=>({screen,stage,editor,current,snapshot,previousTrajectory,showTrail,pauseReason,notice,
      tutorial:{step,lesson:lessons[step-1],review,
        saved:saved&&!['UNKNOWN','CONFLICT'].includes(storage.read().status),graduated:Boolean(marks.graduated)},
      failure:screen==='ERROR'?'講座の実験で異常が発生しました。':
        screen==='FAILED'?'講座の仕掛けを見直して、もう一度実験しましょう。':undefined,
      bestUpdated:false,newStars:0,
      ...(screen==='CLEARED'?{result:{stars:0,achievements:[]}}:{})}),
  };
}
