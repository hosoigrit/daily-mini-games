import {SAVE_KEY, MAX_SAVE_LENGTH, assessSave, createDefaultSave, createSaveEpoch, parseSaveRaw, validTutorial} from './save-validator.js';
import {digestSaveRaw, legacyArchiveKey, legacyArchiveReference, migrationPreview, readLegacyArchive} from './save-migration.js';

export function createSaveRepository({storage, lock, designs, legacyDesigns, epoch = createSaveEpoch}) {
  const version = legacyDesigns ? 2 : 1;
  const freshSave = id => createDefaultSave(id,version);
  const validate = value => assessSave(value,designs,{version});
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
  let legacyPending=null;
  const readArchive = key => legacyDesigns ? readLegacyArchive(storage,key,legacyDesigns) : Promise.resolve(null);
  const read=()=>({mode,status,data,generation:token,editing,saved,dirty:editing!==saved,externalChange,recoveryReason,migrationAvailable:Boolean(legacyPending&&!legacyPending.blocked),legacyBlocked:Boolean(legacyPending?.blocked)});
  const changed=()=>editing++;
  function persist(next, recovery=false, kind='ordinary'){
    if (!lock.isOwner(token) || !recovery && (mode !== 'OWNER' || unknown || status==='CONFLICT')) return false;
    const newRaw=JSON.stringify(next);
    if(newRaw.length>MAX_SAVE_LENGTH || validate(newRaw).status!=='VALID'){
      status='UNSAVED';
      return false;
    }
    const baseline=raw;
    try {
      if(storage.getItem(SAVE_KEY)!==baseline){status='CONFLICT';return false;}
    } catch {
      status='UNSAVED';
      return false;
    }
    try {
      storage.setItem(SAVE_KEY,newRaw);
    } catch {
      if(version===1){status='UNSAVED';return false;}
    }
    const edit=editing;
    try{
      const observed=storage.getItem(SAVE_KEY);
      if(observed!==newRaw) {
        if(version===1) throw new Error('Save readback mismatch.');
        status=observed===baseline?'UNSAVED':'CONFLICT';
        return false;
      }
    }catch{
      unknown={baseline,newRaw,next,edit,token,kind};
      status='UNKNOWN';
      return false;
    }
    raw=newRaw;
    data=next;
    saved=edit;
    status='SAVED';
    if(recovery)mode='OWNER';
    if(kind==='migration')legacyPending=null;
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
      if(!data)data=freshSave(epoch());
      return false;
    }
    if(editing!==before||confirmation&&confirmation.raw!==observed){
      lock.release();token=lock.current();mode='READ_ONLY';status='UNSAVED';externalChange=true;
      return false;
    }
    if(data&&acquired.mode!=='OWNER'&&editing!==saved)return false;
    token=acquired.generation;mode=acquired.mode;raw=observed;
    let loaded=validate(raw);
    legacyPending=null;
    if(version===2 && loaded.reason==='VERSION') {
      const legacy=assessSave(raw,legacyDesigns);
      if(legacy.status==='VALID'||legacy.reason==='REVISION') {
        const source=parseSaveRaw(raw);
        const blocked=source.revision>=Number.MAX_SAFE_INTEGER-1;
        const preview=migrationPreview({...source,stages:blocked?legacy.data.stages:source.stages},
          legacy.data,designs,legacyDesigns,freshSave(source.saveEpoch));
        legacyPending={raw,source,preview,blocked};
        loaded=blocked?{status:'RECOVERY_REQUIRED',reason:'REVISION',data:preview}
          :{status:'MIGRATION_REQUIRED',data:preview};
      }
    }
    data=loaded.data??freshSave(epoch());
    recoveryReason=loaded.reason??null;
    unknown=null;
    externalChange=false;
    editing=saved=0;
    if(loaded.status==='MIGRATION_REQUIRED'){
      if(lock.isOwner(token))mode='MIGRATION_REQUIRED';
      status='MIGRATION_REQUIRED';
    }else if(loaded.status==='RECOVERY_REQUIRED'){
      if(lock.isOwner(token))mode='RECOVERY_REQUIRED';
      status='RECOVERY_REQUIRED';
    }else if(mode==='OWNER'){
      status='SAVED';
      if(loaded.status==='NEW')persist(data);
    }else status='TEMPORARY';
    return true;
  }
  return {
    read,start,captureReacquire,readArchive,
    blockedV1Raw:()=>legacyPending?.blocked?legacyPending.raw:null,
    archiveKeys(){
      try {
        const eligible=(storage.keys?.()??[]).filter(key=>legacyArchiveReference(key));
        if(data?.legacyV1)eligible.push(legacyArchiveKey(data.legacyV1));
        return [...new Set(eligible)].sort();
      } catch {
        return data?.legacyV1?[legacyArchiveKey(data.legacyV1)]:[];
      }
    },
    async migrateV1(confirmed, expectedGeneration=token){
      if(confirmed!==true||!legacyPending||mode!=='MIGRATION_REQUIRED'||expectedGeneration!==token
        ||!lock.isOwner(token)||unknown||status==='CONFLICT')return false;
      const attempt=legacyPending;
      const inEdition=editing;
      const {saveEpoch:sourceEpoch,revision:sourceRevision}=attempt.source;
      try {
        const sourceSHA256=await digestSaveRaw(attempt.raw);
        if(token!==expectedGeneration||editing!==inEdition||legacyPending!==attempt||!lock.isOwner(token))return false;
        if(storage.getItem(SAVE_KEY)!==attempt.raw){status='CONFLICT';return false;}
        const reference={sourceEpoch,sourceRevision,sourceSHA256};
        const key=legacyArchiveKey(reference);
        const retained=storage.getItem(key);
        if(retained!==null&&retained!==attempt.raw){status='CONFLICT';return false;}
        if(retained===null)storage.setItem(key,attempt.raw);
        if(storage.getItem(key)!==attempt.raw){status='UNSAVED';return false;}
        return persist({...attempt.preview,legacyV1:reference,revision:sourceRevision+1},true,'migration');
      } catch {
        if(token===expectedGeneration&&legacyPending===attempt)status='UNSAVED';
        return false;
      }
    },
    commitTutorial(tutorial, expectedGeneration=token){
      if(version!==2||expectedGeneration!==token||mode!=='OWNER'||!lock.isOwner(token)
        ||editing!==saved||!validTutorial(tutorial)||unknown||status==='CONFLICT'
        ||data.tutorial.state==='completed'&&tutorial.state!=='completed')return false;
      return persist({...data,tutorial:{...tutorial},revision:data.revision+1},false,'tutorial');
    },
    commit(next, expectedGeneration=token){
      if(expectedGeneration!==token||legacyPending)return false;
      changed();
      data={...next,revision:data.revision,saveEpoch:data.saveEpoch,
        ...(version===2?{schemaVersion:2,tutorial:data.tutorial,legacyV1:data.legacyV1}:{})};
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
        else data={...data,revision:attempt.next.revision,saveEpoch:attempt.next.saveEpoch,
          ...(attempt.kind==='tutorial'?{tutorial:attempt.next.tutorial}:{})};
        saved=attempt.edit;
        status=editing===saved?'SAVED':'UNSAVED';
        if(mode==='RECOVERY_REQUIRED'||mode==='MIGRATION_REQUIRED')mode='OWNER';
        if(attempt.kind==='migration')legacyPending=null;
        return true;
      }
      status=observed===attempt.baseline?'UNSAVED':'CONFLICT';
      return false;
    },
    notify(newRaw){
      if(newRaw===raw)return false;
      externalChange=true;
      if(mode==='OWNER'||mode==='MIGRATION_REQUIRED')status='CONFLICT';
      return true;
    },
    release(){
      lock.release();
      token=lock.current();
      mode='READ_ONLY';
      status=unknown?'UNKNOWN':'TEMPORARY';
    },
    reset(confirm=false, preserve=false){
      if(!confirm||!lock.isOwner(token)||unknown||legacyPending||status==='CONFLICT')return false;
      if(preserve&&recoveryReason==='VERSION')return false;
      const validRevision=Number.isSafeInteger(data.revision)&&data.revision>=0&&data.revision<Number.MAX_SAFE_INTEGER-1;
      const validEpoch=typeof data.saveEpoch==='string'&&/^[0-9a-f]{32}$/u.test(data.saveEpoch);
      const nextEpoch=validEpoch&&validRevision?data.saveEpoch:epoch();
      if((!validRevision||!validEpoch)&&nextEpoch===data.saveEpoch)return false;
      const next=preserve?{...data,saveEpoch:nextEpoch}:freshSave(nextEpoch);
      next.revision=validRevision&&validEpoch?data.revision+1:0;
      changed();
      return persist(next,true);
    },
  };
}
