import {SAVE_KEY, MAX_SAVE_LENGTH, assessSave, createDefaultSave, createSaveEpoch} from './save-validator.js';

export function createSaveRepository({storage, lock, designs, epoch = createSaveEpoch}) {
  let raw = null;
  let data = null;
  let mode = 'INITIALIZING';
  let status = 'SAVED';
  let token = 0;
  let editing = 0;
  let saved = 0;
  let unknown = null;
  let externalChange=false;
  let recoveryReason=null;
  const read=()=>({mode,status,data,generation:token,editing,saved,dirty:editing!==saved,externalChange,recoveryReason});
  const changed=()=>editing++;
  function persist(next, recovery=false){
    if (!lock.isOwner(token) || !recovery && (mode !== 'OWNER' || unknown || status==='CONFLICT')) return false;
    const newRaw=JSON.stringify(next);
    if(newRaw.length>MAX_SAVE_LENGTH || assessSave(newRaw,designs).status!=='VALID'){
      status='UNSAVED';
      return false;
    }
    const baseline=raw;
    try{
      if(storage.getItem(SAVE_KEY)!==baseline){status='CONFLICT';return false;}
      storage.setItem(SAVE_KEY,newRaw);
    }catch{
      status='UNSAVED';
      return false;
    }
    const edit=editing;
    try{
      if(storage.getItem(SAVE_KEY)!==newRaw)throw new Error('Save readback mismatch.');
    }catch{
      unknown={baseline,newRaw,next,edit,token};
      status='UNKNOWN';
      return false;
    }
    raw=newRaw;
    data=next;
    saved=edit;
    status='SAVED';
    if(recovery)mode='OWNER';
    return true;
  }
  function captureReacquire(){
    try{return {raw:storage.getItem(SAVE_KEY),editing,generation:token};}catch{return null;}
  }
  async function start({confirmation=null}={}){
    if(editing!==saved&&mode!=='INITIALIZING'
      &&(!confirmation||confirmation.editing!==editing||confirmation.generation!==token))return false;
    const before=editing;
    const acquired=await lock.acquire();
    if(acquired.generation!==lock.current())return false;
    let observed;
    try { observed=storage.getItem(SAVE_KEY); } catch {
      mode='DEGRADED';status='TEMPORARY';
      if(!data)data=createDefaultSave(epoch());
      return false;
    }
    if(editing!==before||confirmation&&confirmation.raw!==observed){
      lock.release();token=lock.current();mode='READ_ONLY';status='UNSAVED';externalChange=true;
      return false;
    }
    if(data&&acquired.mode!=='OWNER'&&editing!==saved)return false;
    token=acquired.generation;mode=acquired.mode;raw=observed;
    const loaded=assessSave(raw,designs);
    data=loaded.data??createDefaultSave(epoch());
    recoveryReason=loaded.reason??null;
    unknown=null;
    externalChange=false;
    editing=saved=0;
    if(loaded.status==='RECOVERY_REQUIRED'){
      if(lock.isOwner(token))mode='RECOVERY_REQUIRED';
      status='RECOVERY_REQUIRED';
    }else if(mode==='OWNER'){
      status='SAVED';
      if(loaded.status==='NEW')persist(data);
    }else status='TEMPORARY';
    return true;
  }
  return {
    read,start,captureReacquire,
    commit(next, expectedGeneration=token){
      if(expectedGeneration!==token)return false;
      changed();
      data={...next,revision:data.revision,saveEpoch:data.saveEpoch};
      if(mode==='OWNER'&&status!=='UNKNOWN'&&status!=='CONFLICT'){
        const updated={...data,revision:data.revision+1};
        return persist(updated);
      }
      if(status!=='UNKNOWN'&&status!=='CONFLICT'&&status!=='RECOVERY_REQUIRED')status='TEMPORARY';
      return false;
    },
    reconcile(){
      if(!unknown||!lock.isOwner(token)||unknown.token!==token)return false;
      let observed;
      try{observed=storage.getItem(SAVE_KEY);}catch{return false;}
      const attempt=unknown;
      unknown=null;
      if(observed===attempt.newRaw){
        raw=observed;
        if(editing===attempt.edit)data=attempt.next;
        else data={...data,revision:attempt.next.revision,saveEpoch:attempt.next.saveEpoch};
        saved=attempt.edit;
        status=editing===saved?'SAVED':'UNSAVED';
        if(mode==='RECOVERY_REQUIRED')mode='OWNER';
        return true;
      }
      status=observed===attempt.baseline?'UNSAVED':'CONFLICT';
      return false;
    },
    notify(newRaw){
      if(newRaw===raw)return false;
      externalChange=true;
      if(mode==='OWNER')status='CONFLICT';
      return true;
    },
    release(){
      lock.release();
      token=lock.current();
      mode='READ_ONLY';
      status=unknown?'UNKNOWN':'TEMPORARY';
    },
    reset(confirm=false, preserve=false){
      if(!confirm||!lock.isOwner(token)||unknown||status==='CONFLICT')return false;
      if(preserve&&recoveryReason==='VERSION')return false;
      const validRevision=Number.isSafeInteger(data.revision)&&data.revision>=0&&data.revision<Number.MAX_SAFE_INTEGER-1;
      const validEpoch=typeof data.saveEpoch==='string'&&/^[0-9a-f]{32}$/u.test(data.saveEpoch);
      const nextEpoch=validEpoch&&validRevision?data.saveEpoch:epoch();
      if((!validRevision||!validEpoch)&&nextEpoch===data.saveEpoch)return false;
      const next=preserve?{...data,saveEpoch:nextEpoch}:createDefaultSave(nextEpoch);
      next.revision=validRevision&&validEpoch?data.revision+1:0;
      changed();
      return persist(next,true);
    },
  };
}
