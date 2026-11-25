import {applyEditCommand, createDesignEditor} from '../domain/design-editor.js';
import {unlockedStages} from '../domain/score-service.js';
import {createResultSession} from '../domain/result-evaluator.js';
import {createStageExperiment, resolveStageHint} from '../data/stage-definitions.js';
import {TICK_SECONDS, MAX_TICKS_PER_FRAME, PAUSE_GAP_MS} from '../data/physics-config.js';
import {encodePlacements, decodePlacements} from '../storage/save-validator.js';
import {createFrameClock, isEditCommand, permitsEdit} from './state-machine.js';

const failMessages = {
  'FL-001':'球が左から盤面の外へ出ました。','FL-002':'球が右から盤面の外へ出ました。',
  'FL-003':'球が盤面の下へ落ちました。','FL-004':'球が盤面の上へ飛び出しました。',
  'FL-005':'20秒以内にゴールで止まりませんでした。','FL-006':'指定のパーツを有効に使ってください。',
  PHYSICS_ERROR:'実験中に異常が発生しました。再設計できます。',
};

export function createGameController({stages, identities, hints, storage, change, sound,
  schedule = requestAnimationFrame, cancelFrame = cancelAnimationFrame}) {
  let screen='TITLE', stage=null, editor=null, experiment=null, session=null, designId=0, frame=null, runSerial=0;
  let snapshot=null, current=null, dialog=null, ghost=null, hintConfirmed=false, showTrail=true, pauseReason='';
  let notice='';
  const saveData=()=>storage.read().data;
  const identity=()=>identities[stage?.id];
  function progress(){
    const records=saveData().stages;
    const entries=Object.fromEntries(Object.entries(records).map(([id,entry])=>{
      const unpack=best=>best?{compatibility:best.compatibilityId,placedCount:best.usedParts,stars:best.stars,
        placements:decodePlacements(best.placements)}:null;
      return [id,{cleared:entry.progress.cleared,historicalStars:entry.progress.historicalBestStars,
        best:unpack(entry.currentBest),previousBest:unpack(entry.previousBest)}];
    }));
    return {stages:entries,achievements:{
      allCleared:Object.values(entries).every(r=>r.cleared),allStars:Object.values(entries).every(r=>r.historicalStars===3),
    }};
  }
  function state(){
    return {screen,stage,editor,snapshot,current,dialog,ghost,showTrail,pauseReason,notice,stages,
      unlocked:unlockedStages(progress()),progress:saveData(),save:storage.read(),result:session?.read().result,
      failure:failMessages[session?.read().result?.code],previousTrajectory:session?.read().previousTrajectory};
  }
  const update=()=>change(state());
  function saveStage(next){
    const before=saveData();
    storage.commit({...before,stages:{...before.stages,[stage.id]:next}});
  }
  function loadDesign(next){
    dispose();
    stage=next;
    const row=saveData().stages[stage.id];
    editor=createDesignEditor({placements:decodePlacements(row.draft?.placements??[]),
      best:row.currentBest?decodePlacements(row.currentBest.placements):null});
    session=createResultSession({stageId:stage.id,progress:progress(),onTerminal:finish});
    screen='DESIGN';snapshot=null;current=null;ghost=null;dialog=null;hintConfirmed=false;
  }
  function dispose(){
    if(frame!==null)cancelFrame(frame);
    frame=null;
    experiment?.dispose();
    experiment=null;
    clock.reset();
  }
  function finish(result){
    screen=result.status==='CLEARED'?'CLEARED':result.status==='ERROR'?'ERROR':'FAILED';
    ghost=null;
    if(result.status==='CLEARED'){
      const saved=saveData().stages[stage.id];
      const state=session.read().progress.stages[stage.id];
      const pack=entry=>entry?{compatibilityId:entry.compatibility,physicsRulesVersion:identity().physicsRulesVersion,
        usedParts:entry.placedCount,stars:entry.stars,placements:encodePlacements(entry.placements)}:null;
      const best=pack(state.best);
      saveStage({...saved,progress:{cleared:true,historicalBestStars:state.historicalStars},
        currentBest:best,previousBest:saved.previousBest});
      editor={...editor,best:decodePlacements(best.placements)};
    }
    sound.end(result);
    dispose();
  }
  function step(){
    if(screen!=='RUNNING'||!experiment)return false;
    const next=experiment.step();
    if(!next)return false;
    current=next;
    if(next.usage)sound.observe(experiment.runId,next);
    session.step(experiment.runId,()=>next);
    return true;
  }
  const clock=createFrameClock({step,pause,tickMs:TICK_SECONDS*1000,maxTicks:MAX_TICKS_PER_FRAME,pauseGap:PAUSE_GAP_MS});
  function animate(now){
    frame=null;
    if(screen!=='RUNNING')return;
    clock.advance(now);
    update();
    if(screen==='RUNNING')frame=schedule(animate);
  }
  function pause(reason='手動'){
    if(screen!=='RUNNING')return;
    session.pause();
    sound.stop();
    screen='PAUSED';pauseReason=reason;
    if(frame!==null)cancelFrame(frame);
    frame=null;
    clock.reset();
  }
  function start(){
    if(screen!=='DESIGN'||editor.selection.state==='CONFIRMING')return false;
    const id=`karakuri-${++runSerial}`;
    const settled=applyEditCommand(editor,stage,{type:'cancel'});
    editor=settled.state;
    ghost=null;dialog=null;snapshot=null;current=null;
    experiment=createStageExperiment(stage,editor.placements,{runId:id,observe:obs=>{snapshot=obs;}});
    session.start({id,initialPosition:stage.ball,placements:editor.placements,stageId:stage.id,
      compatibility:identity().compatibilityId,star3Target:stage.star3Target});
    sound.begin(id);
    clock.reset();
    screen='RUNNING';
    frame=schedule(animate);
    return true;
  }
  function edit(command){
    if(!permitsEdit(screen)||dialog)return false;
    const before=editor;
    const outcome=applyEditCommand(editor,stage,command);
    editor=outcome.state;
    if(!outcome.ok){notice='その操作はできません。';return false;}
    if(editor.revision!==before.revision){
      const saved=saveData().stages[stage.id];
      saveStage({...saved,draft:{geometryId:identity().geometryId,placements:encodePlacements(editor.placements)}});
      if(before.selection.operation==='reset')session.clearTrajectory();
      if(['add','commit-draft'].includes(command.type))sound.play('place');
    }
    if(command.type==='rotate'||command.type==='rotate-draft')sound.play('rotate');
    return true;
  }
  function dispatch(command){
    notice='';
    let accepted=true;
    if(isEditCommand(command)){
      accepted=edit(command);
    }else switch(command.type){
      case 'enter': dispose();screen='STAGES';dialog=null;break;
      case 'title': dispose();screen='TITLE';dialog=null;break;
      case 'stage': {
        const candidate=stages.find(s=>s.id===command.id);
        accepted=Boolean(candidate&&unlockedStages(progress()).includes(candidate.id));
        if(accepted)loadDesign(candidate);
        else notice='前のステージをクリアすると解放されます。';
        break;
      }
      case 'start': accepted=start();break;
      case 'pause': pause();break;
      case 'resume':
        if(screen==='PAUSED'&&!dialog){
          clock.reset();
          session.resume();
          screen='RUNNING';
          sound.resume(experiment.runId);
          frame=schedule(animate);
        }else accepted=false;
        break;
      case 'abort':
        if(!['PAUSED','RUNNING'].includes(screen)){accepted=false;break;}
        session.abort();dispose();sound.stop();screen='DESIGN';current=null;snapshot=null;break;
      case 'redesign': screen='DESIGN';dialog=null;snapshot=null;current=null;break;
      case 'edit-preparation': edit({type:'cancel'});break;
      case 'toggle-trail': showTrail=!showTrail;break;
      case 'settings':
        if(screen==='RUNNING')pause('設定');
        dialog={type:'SETTINGS'};break;
      case 'help': dialog={type:'HELP'};break;
      case 'achievements': dialog={type:'ACHIEVEMENTS'};break;
      case 'close-dialog': dialog=null;break;
      case 'setting':
        if(dialog?.type!=='SETTINGS'){accepted=false;break;}
        storage.commit({...saveData(),settings:{...saveData().settings,[command.key]:command.value}});
        sound.configure(saveData().settings);
        break;
      case 'reset-request': dialog={type:'SAVE_RESET'};break;
      case 'reset-confirm':
        if(dialog?.type!=='SAVE_RESET'){accepted=false;break;}
        accepted=storage.reset(true);
        if(accepted){dispose();screen='TITLE';stage=null;editor=null;session=null;ghost=null;}
        dialog=null;break;
      case 'hint-open':
        if(screen!=='DESIGN'){accepted=false;break;}
        dialog={type:'HINT',level:1,hint:resolveStageHint(identity(),hints[stage.id],1)};
        break;
      case 'hint':
        if(dialog?.type!=='HINT'){accepted=false;break;}
        if(command.level===3&&!hintConfirmed){dialog={type:'HINT_CONFIRM'};break;}
        dialog={type:'HINT',level:command.level,hint:resolveStageHint(identity(),hints[stage.id],command.level,true)};
        ghost=command.level===3?dialog.hint?.parts??null:ghost;break;
      case 'hint-confirm':
        if(dialog?.type!=='HINT_CONFIRM'){accepted=false;break;}
        hintConfirmed=true;
        dialog={type:'HINT',level:3,hint:resolveStageHint(identity(),hints[stage.id],3,true)};
        ghost=dialog.hint?.parts??null;break;
      case 'hint-cancel':
        dialog={type:'HINT',level:1,hint:resolveStageHint(identity(),hints[stage.id],1)};break;
      default: accepted=false;
    }
    update();return accepted;
  }
  return {
    state,dispatch,
    hidden(){pause('バックグラウンド');update();},
    rotated(){if(screen==='DESIGN')edit({type:'orientation-change'});pause('画面回転');update();},
    restoreView(){if(stage&&screen==='DESIGN')loadDesign(stage);update();},
    detached(){pause('ページを離れました');sound.stop();update();},
  };
}
