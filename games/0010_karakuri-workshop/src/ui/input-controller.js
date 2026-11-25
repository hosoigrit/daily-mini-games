import {getPartDefinition} from '../data/part-definitions.js';
import {canonicalDesign} from '../domain/design-editor.js';

function gridAt(event, rect) {
  return {gridX: Math.floor((event.clientX-rect.left)/rect.width*40+.5),
    gridY: Math.floor((event.clientY-rect.top)/rect.height*30+.5)};
}

export function hitPart(event, rect, parts) {
  const candidates=parts.map(p=>{
    const d=getPartDefinition(p.type);
    const dx=event.clientX-rect.left-p.gridX*rect.width/40;
    const dy=event.clientY-rect.top-p.gridY*rect.height/30;
    const a=p.angleDeg*Math.PI/180;
    const x=Math.cos(a)*dx+Math.sin(a)*dy, y=-Math.sin(a)*dx+Math.cos(a)*dy;
    const distance=Math.hypot(Math.max(0,Math.abs(x)-d.width*rect.width/19.2),
      Math.max(0,Math.abs(y)-d.height*rect.height/14.4));
    return {p,distance};
  });
  candidates.sort((a,b)=>a.distance-b.distance||
    (a.p.type<b.p.type?-1:Number(a.p.type!==b.p.type))||a.p.gridX-b.p.gridX||a.p.gridY-b.p.gridY||a.p.angleDeg-b.p.angleDeg);
  return candidates[0]?.distance<=8?candidates[0].p:null;
}

export function bindBoardInput(canvas, game) {
  let active=null;
  const dispatch=command=>game.dispatch(command);
  function cancel(event){
    if(active?.id!==event.pointerId)return;
    active=null;
    dispatch({type:'cancel'});
  }
  canvas.addEventListener('pointerdown',event=>{
    const {editor,screen}=game.state();
    if(active||screen!=='DESIGN'||event.button>0||!editor)return;
    const part=hitPart(event,canvas.getBoundingClientRect(),editor.placements);
    active={id:event.pointerId,x:event.clientX,y:event.clientY,part,drag:false};
    canvas.setPointerCapture(event.pointerId);
  });
  function movement(event){
    if(active?.id!==event.pointerId)return;
    const enough=Math.hypot(event.clientX-active.x,event.clientY-active.y)>=6;
    if(enough&&!active.drag){
      active.drag=true;
      if(active.part)dispatch({type:'drag',id:active.part.id});
    }
    if(active.drag&&game.state().editor.selection.draft){
      dispatch({type:'preview',...gridAt(event,canvas.getBoundingClientRect())});
    }
  }
  canvas.addEventListener('pointermove',movement);
  canvas.addEventListener('pointerup',event=>{
    if(active?.id!==event.pointerId)return;
    movement(event);
    const {part,drag}=active;
    active=null;
    const {selection}=game.state().editor;
    if(selection.draft){
      dispatch({type:'commit-draft',id:selection.id??`k-${crypto.randomUUID().slice(0,16)}`,
        ...gridAt(event,canvas.getBoundingClientRect())});
    }else if(part&&!drag)dispatch({type:'select',id:part.id});
  });
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',cancel);
}

export function editWithDirection(game,direction) {
  const {editor}=game.state();
  if(!editor)return false;
  const {selection}=editor;
  const selected=editor.placements.find(p=>p.id===selection.id);
  const [dx,dy]=direction;
  const current=selection.draft??selected;
  if(!current)return false;
  return game.dispatch({type:selection.draft?'preview':'move',id:selection.id,
    gridX:(current.gridX??20)+dx,gridY:(current.gridY??15)+dy});
}

export function editRotation(game,delta) {
  const {editor}=game.state();
  if(!editor)return false;
  const {selection}=editor;
  const selected=selection.draft??editor.placements.find(p=>p.id===selection.id);
  return selected?game.dispatch({type:selection.draft?'rotate-draft':'rotate',
    id:selection.id,angleDeg:selected.angleDeg+delta}):false;
}

export function placementOrder(parts) {
  return canonicalDesign(parts);
}
