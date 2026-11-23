import { VARIANTS } from './case-data.mjs';
import { starsForScore } from './engine.mjs';
export const STORAGE_KEY='daily-mini-games:0008:progress:v1';
export function emptyProgress(){return {solved:[],revealed:[],firstClear:{},best:{},attempted:0};}
export function sanitizeProgress(raw){
  const state=emptyProgress();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return state;
  const known=new Set(VARIANTS.map(v=>v.id));
  const solved=Array.isArray(raw.solved)?raw.solved:[];
  state.solved=[...new Set(solved.filter(s=>typeof s==='string'&&known.has(s)))];
  // Backwards-compatible: v1 saves have no 'revealed' field. Already solved
  // cases stay valid even if their truth is opened afterwards.
  const revealed=Array.isArray(raw.revealed)?raw.revealed:[];
  state.revealed=[...new Set(revealed.filter(s=>typeof s==='string'&&known.has(s)&&!state.solved.includes(s)))];
  for(const key of ['firstClear','best']){
    const source=raw[key];if(!source||typeof source!=='object'||Array.isArray(source))continue;
    for(const [k,v] of Object.entries(source)){
      if(!known.has(k)||!state.solved.includes(k)||!v||typeof v!=='object')continue;
      if(Number.isInteger(v.score)&&v.score>=0&&v.score<=1000&&Number.isFinite(v.elapsed)&&v.elapsed>=0&&v.elapsed<=86400){
        state[key][k]={score:v.score,elapsed:Math.round(v.elapsed),stars:starsForScore(v.score)};
      }
    }
  }
  if(Number.isInteger(raw.attempted)&&raw.attempted>=0&&raw.attempted<1000000)state.attempted=raw.attempted;
  return state;
}
export function loadProgress(storage){
  try {return sanitizeProgress(JSON.parse(storage.getItem(STORAGE_KEY)||'null'));}
  catch{return emptyProgress();}
}
export function saveProgress(storage,progress){
  try{storage.setItem(STORAGE_KEY,JSON.stringify(sanitizeProgress(progress)));return true;}catch{return false;}
}
export function addClear(progress,variantId,record){
  const v=VARIANTS.find(x=>x.id===variantId);
  if(!v)throw new Error('Unknown variant');
  const p=sanitizeProgress(progress);
  // A spoiled variant cannot receive a first-time, unaided-clear record.
  if(p.revealed.includes(variantId))return p;
  if(!record||!Number.isFinite(record.score)||!Number.isFinite(record.elapsed)||record.elapsed<0){
    throw new RangeError('Invalid clear record');
  }
  const score=Math.max(0,Math.min(1000,Math.trunc(record.score)));
  const clean={score,elapsed:Math.min(86400,Math.round(record.elapsed)),stars:starsForScore(score)};
  if(!p.solved.includes(variantId)){
    p.solved.push(variantId);p.firstClear[variantId]=clean;
  }
  if(!p.best[variantId]||clean.score>p.best[variantId].score)p.best[variantId]=clean;
  p.attempted=Math.min(999999,p.attempted+1);
  return p;
}

/** Record a spoiler before showing the explanation, even if the player quits. */
export function markRevealed(progress,variantId){
  if(!VARIANTS.some(v=>v.id===variantId))throw new Error('Unknown variant');
  const p=sanitizeProgress(progress);
  if(!p.solved.includes(variantId)&&!p.revealed.includes(variantId))p.revealed.push(variantId);
  return p;
}
