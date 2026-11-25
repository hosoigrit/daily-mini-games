import {getPartDefinition} from '../data/part-definitions.js';
import {goalGeometry} from '../domain/result-evaluator.js';

const scale=100;
const height=720;
const colors={R:'#9f7150',P:'#b99565',B:'#a44837',S:'#64889d',W:'#644e3d',goal:'#42684b'};
const point=p=>({x:p.x*scale,y:height-p.y*scale});

export function createCanvasRenderer(canvas) {
  const ctx=canvas.getContext('2d');
  function rect(p,{paint,open=false,alpha=1}={}){
    const center=point({x:p.x??p.gridX*.24,y:p.y??(30-p.gridY)*.24});
    const def=getPartDefinition(p.type);
    const width=(p.width??def?.width)*scale;
    const depth=(p.height??def?.height)*scale;
    ctx.save();ctx.globalAlpha=alpha;
    ctx.translate(center.x,center.y);
    ctx.rotate((p.angleDeg??0)*Math.PI/180);
    ctx.lineWidth=open?4:2;ctx.strokeStyle=paint??'#3d3028';ctx.fillStyle=paint??colors[p.type]??'#4b6755';
    if(open)ctx.setLineDash([7,5]);
    else ctx.fillRect(-width/2,-depth/2,width,depth);
    ctx.strokeRect(-width/2,-depth/2,width,depth);
    ctx.restore();
  }
  return function draw(state){
    const dpi=Math.min(window.devicePixelRatio||1,2);
    const bounds=canvas.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const w=Math.round(bounds.width*dpi),h=Math.round(bounds.height*dpi);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(w/960,0,0,h/720,0,0);
    ctx.fillStyle='#f5e8cf';ctx.fillRect(0,0,960,720);
    ctx.strokeStyle='#d9c6a6';ctx.lineWidth=1;
    ctx.beginPath();
    for(let x=0;x<=960;x+=24){ctx.moveTo(x,0);ctx.lineTo(x,720);}
    for(let y=0;y<=720;y+=24){ctx.moveTo(0,y);ctx.lineTo(960,y);}
    ctx.stroke();
    if(!state.stage)return;
    const {stage,editor}=state;
    rect({x:stage.goal.x,y:stage.goal.y+.32,width:1.52,height:.96},{paint:'#6e9368',open:true,alpha:.5});
    for(const board of editor.placements.filter(p=>p.type==='S')){
      for(const angleDeg of [-32,-30,-25,-20,-15,-10,-5,0,5,10,15,20,25,30,32]){
        rect({...board,angleDeg,width:2.05,height:.29},{paint:'#426f91',open:true,alpha:.10});
      }
    }
    for(const fixed of stage.fixed){
      rect(fixed);
      const center=point(fixed);
      ctx.fillStyle='#3d3028';ctx.font='600 16px system-ui';ctx.fillText('固定',center.x-15,center.y-25);
    }
    const dynamic=state.snapshot?.bodies??[];
    const sortedBoards=editor.placements.filter(p=>p.type==='S').sort((a,b)=>a.gridX-b.gridX||a.gridY-b.gridY);
    const boardBodies=dynamic.filter(p=>p.kind==='S').sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    for(const part of editor.placements){
      const body=part.type==='S'?boardBodies[sortedBoards.indexOf(part)]:null;
      rect(body?{...part,x:body.position.x,y:body.position.y,angleDeg:-body.angle*180/Math.PI}:part);
    }
    for(const box of goalGeometry()){
      rect({...box,x:box.x+stage.goal.x,y:box.y+stage.goal.y,type:'goal'});
    }
    if(state.showTrail&&state.previousTrajectory&&!['RUNNING','PAUSED'].includes(state.screen)){
      ctx.beginPath();ctx.strokeStyle='#426f91';ctx.lineWidth=4;ctx.setLineDash([11,9]);
      for(const [i,sample] of state.previousTrajectory.points.entries()){
        const mark=point(sample.position);
        if(i===0)ctx.moveTo(mark.x,mark.y);
        else ctx.lineTo(mark.x,mark.y);
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    const ball=point(dynamic.find(p=>p.kind==='ball')?.position??state.current?.position??stage.ball);
    ctx.beginPath();ctx.arc(ball.x,ball.y,20,0,Math.PI*2);ctx.fillStyle='#b68c50';ctx.fill();
    ctx.strokeStyle='#3a3028';ctx.lineWidth=3;ctx.stroke();
    ctx.beginPath();ctx.arc(ball.x-5,ball.y-6,6,0,Math.PI*2);ctx.fillStyle='#ead7a4';ctx.fill();
    for(const ghost of state.ghost??[])rect(ghost,{paint:'#426f91',open:true,alpha:.7});
    if(state.screen==='DESIGN'){
      const {selection}=editor;
      const selected=selection.draft??editor.placements.find(p=>p.id===selection.id);
      if(selected?.gridX!==undefined)rect(selected,{paint:'#426f91',open:true});
    }
  };
}
