import { VARIANTS, CASES, suspectsFor } from './case-data.mjs';
import { PROOF_CONTRACTS } from './proof-contracts.mjs';
import { EVIDENCE_PROPOSITIONS } from './evidence-propositions.mjs';
import { APPROVED_NARRATIVES } from './approved-narratives.mjs';

export const MAX_EVIDENCE = 4;
/** Shuffle evidence display order once per investigation. Evidence IDs/facts never change. */
export function shuffledEvidenceIds(variant, random=Math.random){
  if(!variant||!Array.isArray(variant.evidence))throw new TypeError('Missing evidence catalog');
  const ids=variant.evidence.map(card=>card.id);
  for(let i=ids.length-1;i>0;i--){
    const r=Number(random());
    const j=Number.isFinite(r)?Math.max(0,Math.min(i,Math.floor(r*(i+1)))):0;
    [ids[i],ids[j]]=[ids[j],ids[i]];
  }
  return ids;
}

export const BASE_SCORE = 1000;
export const INVALID_PROOF_PENALTY = 80;
export const WRONG_PERSON_PENALTY = 180;
export const HINT_PENALTY = 200;

export function variantById(id){return VARIANTS.find(v=>v.id===id) ?? null;}

/** Choose unseen variants first. No completion order or culprit appears before resolution. */
export function chooseVariant(solvedIds=[], random=Math.random, caseId='blue-gem'){
  const solved=new Set(Array.isArray(solvedIds)?solvedIds:[]);
  const matching=VARIANTS.filter(v=>v.caseId===caseId);
  if(!matching.length)throw new RangeError('Unknown case');
  const unseen=matching.filter(v=>!solved.has(v.id));
  const pool=unseen.length?unseen:matching;
  const r=Number(random());
  const index=Number.isFinite(r)?Math.min(pool.length-1,Math.max(0,Math.floor(r*pool.length))):0;
  return pool[index];
}
export function legalSelection(variant, evidenceIds){
  if(!variant||!Array.isArray(evidenceIds)||evidenceIds.length>MAX_EVIDENCE||evidenceIds.length<2){return false;}
  const unique = new Set(evidenceIds);
  return unique.size===evidenceIds.length && evidenceIds.every(id=>typeof id==='string'&&variant.evidence.some(e=>e.id===id));
}
export function provenFacts(variant, evidenceIds){
  const selected=new Set(evidenceIds);
  return new Set(variant.evidence.filter(e=>selected.has(e.id)).flatMap(e=>e.facts));
}
/** Candidate culprit is derived from selected eyewitness/authorization evidence,
 * never from variant.culprit (the separately maintained answer key). */
export function deriveProofActor(variant,evidenceIds){
  const spec=PROOF_CONTRACTS[variant?.id];
  if(!spec)return null;
  const selected=new Set(evidenceIds);
  const assertionById=EVIDENCE_PROPOSITIONS[variant.id] ?? {};
  const actorIds=new Set(Object.keys(spec.actorEvidence)
    .filter(id=>selected.has(id))
    .map(id=>assertionById[id])
    .filter(claim=>claim?.fact==='actor' && claim.polarity==='affirmed' && claim.exclusive && claim.time===spec.moment)
    .map(claim=>claim.actor));
  return actorIds.size===1?[...actorIds][0]:null;
}
/** The UI intentionally hides diagnostic distinctions to prevent trial-and-error. */
export function evaluateProof(variant,suspectId,evidenceIds){
  if(!variant||!legalSelection(variant,evidenceIds)||!suspectsFor(variant).some(s=>s.id===suspectId)){
    return {status:'invalid-input',success:false,missing:variant?.requiredFacts??[]};
  }
  const spec=PROOF_CONTRACTS[variant.id];
  if(!spec||validateProofContract(variant).length)return {status:'invalid-input',success:false,missing:[]};
  const facts=provenFacts(variant,evidenceIds);
  const missing=spec.requiredFacts.filter(f=>!facts.has(f));
  if(missing.length)return {status:'insufficient',success:false,missing};
  const actor=deriveProofActor(variant,evidenceIds);
  if(!actor)return {status:'insufficient',success:false,missing:['actor']};
  if(suspectId!==actor)return {status:'wrong-person',success:false,missing:[]};
  return {status:'solved',success:true,missing:[]};
}

/**
 * Any narrative edit needs independent approval of the exact text baseline.
 * This is a fail-closed integrity gate, NOT automatic Japanese semantic parsing.
 */
export function validateCaseNarrative(caseRecord){
  const reviewed=APPROVED_NARRATIVES.cases[caseRecord?.id];
  if(!reviewed)return [`${caseRecord?.id??'unknown'}: missing approved case narrative`];
  const errors=[];
  if(caseRecord.lead!==reviewed.lead)errors.push(`${caseRecord.id}: unreviewed case lead`);
  if(JSON.stringify(caseRecord.rules)!==JSON.stringify(reviewed.rules))errors.push(`${caseRecord.id}: unreviewed case rules`);
  return errors;
}
export function validateVariantNarrative(variant){
  const reviewed=APPROVED_NARRATIVES.variants[variant?.id];
  if(!reviewed)return [`${variant?.id??'unknown'}: missing approved variant narrative`];
  const errors=[];
  for(const key of ['method','premise','hints','explanation','twist','statements']){
    if(JSON.stringify(variant[key])!==JSON.stringify(reviewed[key]))errors.push(`${variant.id}: unreviewed ${key}`);
  }
  const evidence=new Map(variant.evidence.map(e=>[e.id,e]));
  if(evidence.size!==Object.keys(reviewed.evidence).length)errors.push(`${variant.id}: evidence count differs from approved narrative`);
  for(const [id,approved] of Object.entries(reviewed.evidence)){
    const card=evidence.get(id);
    if(!card || ['kind','title','body'].some(key=>card[key]!==approved[key]))errors.push(`${variant.id}: unreviewed evidence ${id}`);
  }
  for(const id of evidence.keys())if(!(id in reviewed.evidence))errors.push(`${variant.id}: unapproved evidence card ${id}`);
  return errors;
}
/** Audit reviewed prose, structured propositions, actor identification, answer key. */
export function validateProofContract(variant){
  const errors=validateVariantNarrative(variant);const spec=PROOF_CONTRACTS[variant?.id];
  if(!spec)return [`${variant?.id??'unknown'}: missing independent proof contract`];
  const candidates=suspectsFor(variant),suspects=new Map(candidates.map(s=>[s.id,s.name]));
  const answerIds=new Set(Object.values(spec.actorEvidence));
  if(answerIds.size!==1)errors.push(`${variant.id}: evidence identifies multiple actors`);
  if(!answerIds.has(variant.culprit))errors.push(`${variant.id}: culprit disagrees with independent evidence`);
  if(JSON.stringify(spec.requiredFacts)!==JSON.stringify(variant.requiredFacts))errors.push(`${variant.id}: required facts disagree with independent contract`);
  const evidenceById=new Map(variant.evidence.map(e=>[e.id,e]));
  const propositions=EVIDENCE_PROPOSITIONS[variant.id] ?? {};
  const actorCards=variant.evidence.filter(e=>e.facts.includes('actor'));
  if(actorCards.length!==Object.keys(spec.actorEvidence).length)errors.push(`${variant.id}: unmapped actor proof card`);
  const factCards=variant.evidence.filter(e=>e.facts.length);
  if(Object.keys(propositions).length!==factCards.length)errors.push(`${variant.id}: proposition coverage mismatch`);
  for(const e of factCards){
    const claim=propositions[e.id];
    if(!claim){errors.push(`${variant.id}: missing proposition ${e.id}`);continue;}
    if(e.facts.length!==1 || e.facts[0]!==claim.fact)errors.push(`${variant.id}: proposition fact mismatch ${e.id}`);
    if(claim.polarity!=='affirmed' || !e.body.includes(claim.time))errors.push(`${variant.id}: proposition polarity/time mismatch ${e.id}`);
    if(claim.fact==='actor' && (!claim.actor || !claim.exclusive || claim.time!==spec.moment))errors.push(`${variant.id}: invalid actor proposition ${e.id}`);
    if(claim.fact!=='actor' && (claim.actor!==null||claim.exclusive))errors.push(`${variant.id}: invalid non-actor proposition ${e.id}`);
  }
  for(const id of Object.keys(propositions))if(!evidenceById.has(id) || !evidenceById.get(id).facts.length)errors.push(`${variant.id}: unmapped proposition ${id}`);
  for(const [id,actor] of Object.entries(spec.actorEvidence)){
    const card=evidenceById.get(id),name=suspects.get(actor);
    const claim=propositions[id];
    if(!claim||claim.fact!=='actor'||claim.actor!==actor||claim.polarity!=='affirmed'||claim.time!==spec.moment||!claim.exclusive)errors.push(`${variant.id}: actor proposition disagrees with contract ${id}`);
    if(!card||!card.facts.includes('actor')||!name){errors.push(`${variant.id}: invalid actor proof ${id}`);continue;}
    const mentioned=candidates.filter(s=>card.body.includes(s.name));
    if(mentioned.length!==1||mentioned[0].id!==actor)errors.push(`${variant.id}: actor name in ${id} disagrees with contract`);
    if(!card.body.includes(spec.moment))errors.push(`${variant.id}: timestamp in ${id} disagrees with contract`);
  }
  for(const e of actorCards)if(!(e.id in spec.actorEvidence))errors.push(`${variant.id}: missing actor annotation ${e.id}`);
  return errors;
}

export function calculateScore({insufficient=0,wrongPerson=0,hints=0}={}){
  const numbers=[insufficient,wrongPerson,hints];
  if(numbers.some(n=>!Number.isInteger(n)||n<0)){throw new RangeError('Counts must be nonnegative integers');}
  return Math.max(0, BASE_SCORE-INVALID_PROOF_PENALTY*insufficient-WRONG_PERSON_PENALTY*wrongPerson-HINT_PENALTY*hints);
}
export function starsForScore(score){return score>=950?3:score>=700?2:1;}
export function validateCatalog(){
  const errors=[];
  const ids=new Set();
  const caseIds=new Set();
  for(const c of CASES){
    errors.push(...validateCaseNarrative(c));
    if(caseIds.has(c.id))errors.push(`duplicate case ${c.id}`);
    caseIds.add(c.id);
    if(c.variants.length!==3)errors.push(`${c.id}: expected 3 variants`);
    if(new Set(c.variants.map(v=>v.culprit)).size!==3)errors.push(`${c.id}: culprit variation missing`);
    if(new Set(c.variants.map(v=>v.method)).size!==3)errors.push(`${c.id}: method variation missing`);
  }
  if(Object.keys(PROOF_CONTRACTS).length!==VARIANTS.length)errors.push('independent proof contracts count differs from variants');
  if(Object.keys(EVIDENCE_PROPOSITIONS).length!==VARIANTS.length)errors.push('proposition contracts count differs from variants');
  if(Object.keys(APPROVED_NARRATIVES.variants).length!==VARIANTS.length)errors.push('approved narratives count differs from variants');
  if(Object.keys(APPROVED_NARRATIVES.cases).length!==CASES.length)errors.push('approved case narratives count differs from catalog');
  for(const v of VARIANTS){
    errors.push(...validateProofContract(v));
    const suspects=new Set(suspectsFor(v).map(s=>s.id));
    if(!caseIds.has(v.caseId))errors.push(`${v.id}: unknown case`);
    if(v.statements.length!==suspects.size)errors.push(`${v.id}: statement count mismatch`);
    for(const s of v.statements)if(!suspects.has(s.person))errors.push(`${v.id}: unknown witness ${s.person}`);
    if(ids.has(v.id))errors.push(`${v.id}: duplicate variant`);ids.add(v.id);
    if(!suspects.has(v.culprit))errors.push(`${v.id}: unknown culprit`);
    const cardIds=new Set(),factCoverage=new Set();
    for(const e of v.evidence){
      if(cardIds.has(e.id))errors.push(`${v.id}: duplicate card ${e.id}`); cardIds.add(e.id);
      for(const f of e.facts)factCoverage.add(f);
    }
    for(const f of v.requiredFacts)if(!factCoverage.has(f))errors.push(`${v.id}: missing fact coverage ${f}`);
    if(v.requiredFacts.length>MAX_EVIDENCE)errors.push(`${v.id}: proof longer than selection limit`);
    const available=v.evidence.filter(e=>e.facts.length);
    const combinations=[];
    const walk=(i,list)=>{if(list.length>=2&&list.length<=MAX_EVIDENCE)combinations.push(list.map(e=>e.id));if(list.length===MAX_EVIDENCE)return;for(let j=i;j<available.length;j++)walk(j+1,[...list,available[j]]);};
    walk(0,[]);
    if(!combinations.some(cards=>evaluateProof(v,v.culprit,cards).success))errors.push(`${v.id}: not solvable`);
    for(const suspect of suspects){if(suspect===v.culprit)continue;
      if(combinations.some(cards=>evaluateProof(v,suspect,cards).success))errors.push(`${v.id}: false positive culprit ${suspect}`);
    }
  }
  return errors;
}
