import {SOUNDS} from './sound-definitions.js';

export function createAudioController(contextFactory = () => new AudioContext()) {
  let context=null,settings={muted:false,volume:.7},runId=null,audible=false;
  const active=new Set(),pending=new Set(),last=new Map(),ended=new Set(),used=new Set();
  function silence(){
    for(const timer of pending)clearTimeout(timer);
    pending.clear();
    for(const voice of active)voice.stop();
    active.clear();
  }
  async function gesture(){
    try{
      context??=contextFactory();
      if(context.state==='suspended')await context.resume();
    }catch{}
  }
  function play(name){
    const s=SOUNDS[name];
    if(!s||!context||context.state!=='running'||settings.muted||settings.volume===0)return false;
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
      volume.gain.linearRampToValueAtTime(settings.volume*.13,now+.01);
      volume.gain.linearRampToValueAtTime(0,stopAt);
      oscillator.connect(volume);
      volume.connect(context.destination);
      const voice={priority:s.priority,stop(){
        try{oscillator.stop();}catch{}
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
    }catch{return false;}
  }
  return {
    gesture,play,
    configure(next){settings=next;if(next.muted||next.volume===0)silence();},
    begin(id){silence();last.clear();used.clear();runId=id;audible=true;},
    resume(id){if(id===runId)audible=true;},
    stop(){audible=false;silence();},
    observe(id,frame){
      if(!audible||runId!==id)return;
      if(frame.usage.activation)play('spring');
      if(frame.usage.raw.some(row=>row.event==='platform-impact'&&row.impulseY/row.ballMass>=.15))play('collide');
      for(const item of frame.usage.raw){
        if(item.event!=='solver-load'||used.has(item.id)||!frame.usage.state.usedIds.includes(item.id))continue;
        used.add(item.id);play('tilt');
      }
    },
    end(result){
      if(result.runId!==runId||ended.has(runId))return;
      ended.add(runId);
      audible=false;
      if(result.status==='FAILED')play('failed');
      if(result.status==='CLEARED'){
        play('clear');
        for(let i=0;i<result.stars;i++){
          const timer=setTimeout(()=>{pending.delete(timer);play('star');},i*120+40);
          pending.add(timer);
        }
      }
    },
  };
}
