import {SOUNDS} from './sound-definitions.js';
import {BALL} from '../data/physics-config.js';

const tiltAngle=5*Math.PI/180;

export function createAudioController(contextFactory = () => new AudioContext()) {
  let context=null,master=null,settings={muted:false,volume:.7},runId=null,audible=false,soundError=false;
  const active=new Set(),pending=new Set(),last=new Map(),ended=new Set(),angleReferences=new Map();
  function silence(){
    for(const timer of pending)clearTimeout(timer);
    pending.clear();
    for(const voice of active)voice.stop();
    active.clear();
  }
  function setMaster(){
    if(master)master.gain.setValueAtTime(settings.muted?0:settings.volume,context.currentTime);
  }
  async function gesture(){
    try{
      if(!context){
        context=contextFactory();
        master=context.createGain();
        master.connect(context.destination);
        setMaster();
      }
      if(context.state==='suspended')await context.resume();
      soundError=context.state!=='running';
    }catch{soundError=true;}
  }
  function play(name){
    const s=SOUNDS[name];
    if(!s||!context||!master||context.state!=='running'||settings.muted||settings.volume===0)return false;
    const now=context.currentTime;
    const previous=last.get(name);
    if(previous!==undefined&&(now-previous)*1000+1e-7<s.interval)return false;
    if(active.size>=4){
      const victim=[...active].find(v=>v.priority<s.priority);
      if(!victim)return false;
      victim.stop();
      active.delete(victim);
    }
    try{
      const oscillator=context.createOscillator();
      const volume=context.createGain();
      const stopAt=now+s.ms/1000;
      oscillator.type='sine';
      for(const [i,f] of s.hz.entries()){
        const when=now+i*s.ms/1000/s.hz.length;
        if(i===0)oscillator.frequency.setValueAtTime(f,when);
        else oscillator.frequency.linearRampToValueAtTime(f,when);
      }
      volume.gain.setValueAtTime(0,now);
      volume.gain.linearRampToValueAtTime(.13,now+.01);
      volume.gain.linearRampToValueAtTime(0,stopAt);
      oscillator.connect(volume);
      volume.connect(master);
      const voice={priority:s.priority,stop(){
        try{
          const at=context.currentTime;
          volume.gain.cancelScheduledValues?.(at);
          volume.gain.setValueAtTime(0,at);
          oscillator.stop(at);
        }catch{}
      }};
      active.add(voice);
      oscillator.onended=()=>{
        active.delete(voice);
        oscillator.disconnect();
        volume.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(stopAt);
      last.set(name,now);
      return true;
    }catch{soundError=true;return false;}
  }
  function observeTilt(frame){
    for(const [index,pose] of (frame.presentation?.bodyObservations??[]).entries()){
      const used=new Set(frame.usage.frames[index].qualified.map(p=>p.id));
      const phase=pose.phase;
      for(const body of pose.bodies){
        if(body.kind!=='S')continue;
        if(!used.has(body.id)){angleReferences.delete(body.id);continue;}
        if(!angleReferences.has(body.id))angleReferences.set(body.id,body.angle);
        if(phase==='before-step'){
          const ended=frame.usage.raw.some(p=>p.id===body.id&&p.substep===pose.substep
            &&(p.event==='end-contact'||p.event==='pre-solve'&&!p.upper));
          if(ended)angleReferences.delete(body.id);
          continue;
        }
        const start=angleReferences.get(body.id);
        if(start===undefined)angleReferences.set(body.id,body.angle);
        else if(Math.abs(body.angle-start)+1e-12>=tiltAngle&&play('tilt'))angleReferences.set(body.id,body.angle);
      }
    }
  }
  return {
    gesture,play,unavailable:()=>soundError,
    configure(next){settings=next;setMaster();if(next.muted||next.volume===0)silence();},
    begin(id){silence();last.clear();angleReferences.clear();runId=id;audible=true;},
    resume(id){if(id===runId)audible=true;},
    stop(){audible=false;silence();},
    observe(id,frame){
      if(!audible||runId!==id)return;
      if(frame.usage.activation)play('spring');
      if(frame.presentation?.contacts.some(event=>event.event==='post-solve'
        &&event.points.some(p=>p.normalImpulse/BALL.mass>=.15)))play('collide');
      observeTilt(frame);
    },
    end(result){
      if(result.runId!==runId||ended.has(runId))return;
      ended.add(runId);
      audible=false;
      if(result.status==='FAILED')play('failed');
      if(result.status==='CLEARED'){
        play('clear');
        for(let i=0;i<Math.min(3,result.newStars??0);i++){
          const timer=setTimeout(()=>{pending.delete(timer);play('star');},i*120+40);
          pending.add(timer);
        }
      }
    },
  };
}
