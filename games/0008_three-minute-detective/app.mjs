import { CASES, VARIANTS, caseById, suspectsFor } from './case-data.mjs';
import { chooseVariant, evaluateProof, calculateScore, starsForScore, MAX_EVIDENCE, shuffledEvidenceIds } from './engine.mjs';
import { loadProgress, saveProgress, addClear, markRevealed } from './storage.mjs';

const THEME_COLORS=Object.freeze({
  home:'#212a31',
  'blue-gem':'#102a50',
  manuscript:'#3a1e34',
  clocktower:'#3c3020',
  harbor:'#103b40'
});
const app=document.querySelector('#app');
const announcement=document.querySelector('#announcement');
const accuseDialog=document.querySelector('#accuse-dialog');
const revealDialog=document.querySelector('#reveal-dialog');
const abortDialog=document.querySelector('#abort-dialog');
const esc=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage=(()=>{try{return window.localStorage;}catch{return {getItem(){return null;},setItem(){throw new Error('Storage unavailable');}};}})();
let progress=loadProgress(storage);
let savedSuccessfully=true;
const state={phase:'home',selectedCaseId:'blue-gem',variant:null,tab:'investigate',showContext:true,evidence:[],evidenceOrder:[],suspect:null,wrongProof:0,wrongPerson:0,hintLevel:0,feedback:'',startedAt:0,elapsed:0,score:0,assisted:false,resultType:''};
const caseInfo=()=>caseById(state.variant?.caseId ?? state.selectedCaseId);
const caseSolved=c=>c.variants.filter(v=>progress.solved.includes(v.id)).length;
const countSolved=()=>caseSolved(caseInfo());
const unseenCount=c=>c.variants.filter(v=>!progress.solved.includes(v.id)&&!progress.revealed.includes(v.id)).length;
const persons=()=>caseInfo().suspects;
const personById=id=>persons().find(s=>s.id===id);
const elapsed=()=>state.startedAt?Math.max(0,Math.round((performance.now()-state.startedAt)/1000)):0;
const formatTime=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const announce=text=>{announcement.textContent='';queueMicrotask(()=>announcement.textContent=text);};

function renderProgress(){
 const c=caseInfo(), solved=caseSolved(c);
 return `<div class="progress-head"><span>事件ファイル / ${c.number}</span><span>解決した真相 <b data-testid="progress">${solved} / ${c.variants.length}</b></span></div>
  <div class="progress-track" role="progressbar" aria-label="真相の解決状況" aria-valuenow="${solved}" aria-valuemin="0" aria-valuemax="${c.variants.length}"><div style="width:${solved/c.variants.length*100}%"></div></div>`;
}
function renderSuspects(){return `<div class="suspects">${persons().map(p=>`<div class="suspect-card"><span class="suspect-avatar avatar-${p.id}" aria-hidden="true">${p.initials}</span><strong>${esc(p.name)}</strong><small>${esc(p.role)}</small></div>`).join('')}</div>`;}
function renderHome(){
 const c=caseInfo();
 return `<section class="paper-panel home-panel">
    <div class="subhead"><div><p class="tiny-label">SELECT CASE FILE</p><h2>捜査する事件を選ぶ</h2></div><span class="case-pill">全${CASES.length}事件 / ${VARIANTS.length}真相</span></div>
    <p class="section-guide">事件を選び、複数の真相を立証しよう。未解決の真相から優先して出題されます。</p>
    <div class="case-select-grid">${CASES.map(item=>`<button type="button" class="case-select ${c.id===item.id?'is-current':''}" data-action="select-case" data-id="${item.id}" data-testid="case-${item.id}" aria-pressed="${c.id===item.id}"><span class="tiny-label">CASE ${item.number} / ${esc(item.theme)}</span><strong>${esc(item.name)}</strong><span class="case-progress">自力解決 ${caseSolved(item)} / ${item.variants.length}</span></button>`).join('')}</div>
    ${renderProgress()}
    <div class="panel-title"><div><p class="tiny-label">SELECTED MYSTERY</p><h2>${esc(c.name)}</h2></div><span class="case-pill">CASE ${c.number}</span></div>
    <p class="lead">${esc(c.lead)}</p>${renderSuspects()}
    <div class="briefing"><div class="briefing-mark">!</div><p><strong>遊び方</strong><br>証言と証拠を調べ、犯人を1人選び、根拠を2〜4件提示。立証が成立すると解決です。通常モードに時間制限はありません。</p></div>
    <details class="rules"><summary>公平な推理のための共通前提 <span aria-hidden="true">＋</span></summary><ul>${c.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></details>
    <button class="btn btn-primary btn-wide" data-action="start">${unseenCount(c)>0?'未体験の真相を捜査する':'もう一度捜査する'} <span aria-hidden="true">→</span></button>
    <p class="microcopy">事件ごとの3つの真相は犯人・手口・証拠関係が変わります。${unseenCount(c)===0?'この事件に未体験の真相はありません。':'未体験の真相を優先します。'}</p>
    ${!savedSuccessfully?'<p class="storage-warning" role="status">保存が利用できないため進行状況が保持されない可能性があります。</p>':''}
    </section>`;
}
function renderContext(){
  const v=state.variant,c=caseInfo();
  return `<aside class="context-panel"><p class="tiny-label">CASE DETAILS</p><h3>事件の前提と証言</h3>
  <p class="premise"><strong>今回の調査で判明した条件</strong><br>${esc(v.premise)}</p>
  <details class="rules compact"><summary>共通の事件ルール <span aria-hidden="true">＋</span></summary><ul>${c.rules.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>
  <h4>容疑者の証言</h4><div class="statements">${v.statements.map(st=>{const s=personById(st.person);return `<div class="statement"><span class="letter avatar-${s.id}">${s.initials}</span><div><strong>${s.name} <small>${s.role}</small></strong><p>${esc(st.text)}</p></div></div>`;}).join('')}</div>
  <p class="note">※ 証言は犯行の証明そのものではありません。客観的な証拠と照らし合わせましょう。</p></aside>`;
}
function renderEvidence(){
  const v=state.variant;return `<div class="investigate-content"><div class="subhead"><div><p class="tiny-label">EVIDENCE LIST</p><h3>証拠を調べる</h3></div><span class="selection-counter">選択 ${state.evidence.length} / ${MAX_EVIDENCE}</span></div>
  <p class="section-guide">カードをタップして「立証に使う証拠」を選択。再タップで解除できます。</p>
  <div class="evidence-grid">${state.evidenceOrder.map((id,index)=>{const e=v.evidence.find(card=>card.id===id);return `<button class="evidence-card ${state.evidence.includes(e.id)?'is-selected':''}" type="button" data-action="toggle-card" data-id="${e.id}" aria-pressed="${state.evidence.includes(e.id)}" data-testid="evidence-${e.id}"><span class="evidence-top"><span class="evidence-id">No.${String(index+1).padStart(2,'0')} / ${esc(e.kind)}</span><span class="selected-indicator" aria-hidden="true">${state.evidence.includes(e.id)?'✓':'＋'}</span></span><strong>${esc(e.title)}</strong><span class="card-desc">${esc(e.body)}</span></button>`;}).join('')}</div>
  <div class="panel-footer"><span>${state.evidence.length===MAX_EVIDENCE?`選択できるのは${MAX_EVIDENCE}件までです。`:'必要な証拠をそろえましょう。'}</span><button class="btn btn-primary" data-action="tab-board">推理ボードへ →</button></div></div>`;
}
function renderBoard(){
  const v=state.variant;
  return `<div class="board-content"><div class="subhead"><div><p class="tiny-label">REASONING BOARD</p><h3>推理を立証する</h3></div><span class="case-pill">推理提出</span></div>
  <p class="section-guide">犯人を1人選び、証拠を2〜4件そろえて告発します。</p>
  <h4 class="field-label">01 / 犯人を選択</h4><div class="suspect-choices">${persons().map(p=>`<button data-action="choose-person" data-id="${p.id}" type="button" class="suspect-choice ${state.suspect===p.id?'is-selected':''}" aria-pressed="${state.suspect===p.id}" data-testid="suspect-${p.id}"><span class="letter avatar-${p.id}">${p.initials}</span><span><strong>${p.name}</strong><small>${p.role}</small></span><span class="choice-indicator" aria-hidden="true">${state.suspect===p.id?'✓':'○'}</span></button>`).join('')}</div>
  <h4 class="field-label">02 / 根拠となる証拠</h4><div class="selected-list">${state.evidence.length?state.evidence.map(id=>{const e=v.evidence.find(x=>x.id===id);return `<div class="selected-item"><span>${esc(e.title)}</span><button type="button" data-action="toggle-card" data-id="${id}" aria-label="${esc(e.title)}を選択から外す">×</button></div>`;}).join(''):'<p class="empty-message">まだ証拠が選択されていません。</p>'}</div>
  <div class="board-actions"><button class="btn btn-muted" data-action="tab-investigate">← 証拠を選び直す</button><button class="btn btn-primary" data-action="accuse" data-testid="accuse" ${state.suspect===null||state.evidence.length<2?'disabled':''}>告発する →</button></div>
  ${state.feedback?`<div class="neutral-feedback" role="status"><strong>まだ立証できませんでした</strong><p>${esc(state.feedback)}</p></div>`:''}
  <section class="hint-section"><div><h4>捜査に行き詰まったら</h4><p>ヒントは段階式。使用するとクリア時のスコアが下がります。</p></div>
  ${state.hintLevel>0?`<ol class="hint-list">${v.hints.slice(0,state.hintLevel).map(h=>`<li>${esc(h)}</li>`).join('')}</ol>`:''}
  <div class="hint-actions"><button type="button" class="btn btn-muted" data-action="hint" ${state.hintLevel>=2?'disabled':''}>${state.hintLevel===0?'ヒント1を見る（−200点）':state.hintLevel===1?'ヒント2を見る（−200点）':'ヒントはすべて表示済み'}</button>${state.hintLevel===2?'<button type="button" class="btn btn-text" data-action="reveal">真相を見る（自力解決にはならない）</button>':''}</div></section></div>`;
}
function renderPlaying(){
  return `<section class="game-layout">${renderContext()}<section class="paper-panel gameplay-panel">${renderProgress()}
   <div class="play-heading"><div><p class="tiny-label">CASE ${caseInfo().number} / ${esc(caseInfo().name)}</p><h2>犯人を論理で追いつめろ</h2></div><span class="play-clock">経過 <b id="elapsed-clock">${formatTime(elapsed())}</b></span></div>
   <div class="mobile-context"><button type="button" class="btn btn-muted mobile-context-toggle" data-action="toggle-context" aria-expanded="${state.showContext}">${state.showContext?'事件の前提と証言を閉じる ▲':'事件の前提と証言を開く ▼'}</button>${state.showContext?`<div class="mobile-context-body">${renderContext()}</div>`:''}</div>
   <div class="game-utilities"><button type="button" class="btn btn-text" data-action="abort">捜査を中断して事件一覧へ戻る</button></div>
   <nav class="tabs" aria-label="捜査画面の切り替え"><button type="button" data-action="tab-investigate" class="tab ${state.tab==='investigate'?'active':''}" aria-current="${state.tab==='investigate'?'page':'false'}">証拠を調べる <span>${state.variant.evidence.length}件</span></button><button type="button" data-action="tab-board" class="tab ${state.tab==='board'?'active':''}" aria-current="${state.tab==='board'?'page':'false'}">推理ボード <span>${state.evidence.length}件選択</span></button></nav>
   ${state.tab==='investigate'?renderEvidence():renderBoard()}
   </section></section>`;
}
function renderResult(){
  const v=state.variant,p=personById(v.culprit),c=caseInfo();
  const won=state.resultType==='self-clear';
  const reviewed=state.resultType==='review-clear';
  return `<section class="paper-panel result-panel">${renderProgress()}
    <div class="result-emblem">${won?'✦':'⌕'}</div><p class="tiny-label center">CASE FILE CLOSED</p><h2>${won?'事件解決！':reviewed?'再挑戦クリア！':'事件の真相'}</h2>
    <p class="result-sub">${won?'証拠から犯人を立証しました。':reviewed?'既に真相を確認した事件を再び立証しました。初見・自力解決記録には加算されません。':'今回は解説を確認しました。自力解決記録には加算されません。'}</p>
    ${won?`<div class="result-stats"><div><span>スコア</span><strong>${state.score}</strong><small> / 1000</small></div><div><span>解決時間</span><strong>${formatTime(state.elapsed)}</strong></div><div><span>評価</span><strong aria-label="${starsForScore(state.score)}つ星">${'★'.repeat(starsForScore(state.score))}${'☆'.repeat(3-starsForScore(state.score))}</strong></div></div>`:''}
    <div class="solution-box"><p class="tiny-label">THE TRUTH</p><h3>真犯人：${p.name}</h3><p class="solution-method">手口：${esc(v.method)}</p><p>${esc(v.explanation)}</p><div class="twist"><strong>事件のポイント</strong><p>${esc(v.twist)}</p></div></div>
    <div class="result-actions"><button class="btn btn-primary" data-action="start">${unseenCount(c)>0?'未体験の真相に挑戦 →':'もう一度捜査する →'}</button><button class="btn btn-muted" data-action="home">事件一覧へ戻る</button></div>
    <p class="microcopy">真相の違いは解決後に確認できます。次の挑戦では事件の内容が変わる可能性があります。</p>
   </section>`;
}
/** Re-render without dropping keyboard focus. Major view changes return to their new heading. */
function render({scrollTo=null}={}){
  const previous=document.activeElement?.closest?.('button[data-action]');
  const previousAction=previous?.dataset.action;
  const previousId=previous?.dataset.id;
  // Browsing case cards stays neutral; an active case and its result use its own theme.
  const scene=state.phase==='home'?'home':caseInfo().id;
  document.body.dataset.caseTheme=scene;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',THEME_COLORS[scene]??THEME_COLORS.home);
  app.innerHTML=state.phase==='home'?renderHome():state.phase==='playing'?renderPlaying():renderResult();
  if(previousAction){
    const replacement=[...app.querySelectorAll('button[data-action]')].find(b=>b.dataset.action===previousAction && b.dataset.id===previousId);
    if(replacement && !replacement.disabled)replacement.focus({preventScroll:true});
  }
  const targets={game:'.gameplay-panel',tabs:'.tabs',home:'.home-panel',result:'.result-panel'};
  if(scrollTo && targets[scrollTo])app.querySelector(targets[scrollTo])?.scrollIntoView({block:'start',behavior:'auto'});
}
function startCase(){
  state.variant=chooseVariant([...progress.solved,...progress.revealed],Math.random,state.selectedCaseId);
  Object.assign(state,{phase:'playing',tab:'investigate',showContext:true,evidence:[],evidenceOrder:shuffledEvidenceIds(state.variant),suspect:null,wrongProof:0,wrongPerson:0,hintLevel:0,feedback:'',startedAt:performance.now(),elapsed:0,score:0,assisted:false,resultType:''});
  render({scrollTo:'game'});announce('捜査を開始しました。証拠を確認してください。');
}
function toggleCard(id){
  if(!state.variant.evidence.some(e=>e.id===id))return;
  if(state.evidence.includes(id))state.evidence=state.evidence.filter(x=>x!==id);
  else if(state.evidence.length<MAX_EVIDENCE)state.evidence=[...state.evidence,id];
  else {announce('証拠は最大4件までです。');return;}
  state.feedback=''; render();
}
function submit(){
  const verdict=evaluateProof(state.variant,state.suspect,state.evidence);
  if(verdict.status==='invalid-input')return;
  if(!verdict.success){
    if(verdict.status==='wrong-person')state.wrongPerson++;else state.wrongProof++;
    // Do not disclose whether the person is correct; the same message is shown for every failed submission.
    state.feedback='提出した情報だけでは、選んだ容疑者が犯人だと一意に証明できません。証拠を整理して、もう一度考えてみましょう。';
    state.tab='board';render();announce('立証は成立しませんでした。');return;
  }
  state.score=calculateScore({insufficient:state.wrongProof,wrongPerson:state.wrongPerson,hints:state.hintLevel});
  state.elapsed=elapsed();state.phase='result';
  const alreadyRevealed=progress.revealed.includes(state.variant.id);
  state.assisted=alreadyRevealed;state.resultType=alreadyRevealed?'review-clear':'self-clear';
  if(!alreadyRevealed){
    progress=addClear(progress,state.variant.id,{score:state.score,elapsed:state.elapsed,stars:starsForScore(state.score)});
    savedSuccessfully=saveProgress(storage,progress);
  }
  render({scrollTo:'result'});announce('事件を解決しました。');
}
function reveal(){
  progress=markRevealed(progress,state.variant.id);
  savedSuccessfully=saveProgress(storage,progress);
  state.phase='result';state.assisted=true;state.resultType='reveal';state.elapsed=elapsed();
  render({scrollTo:'result'});announce('真相の解説を表示しました。');
}
function handleAction(action,id){
  if(action==='select-case' && state.phase==='home' && caseById(id)){state.selectedCaseId=id;render();return;}
  if(action==='start'){startCase();return;}
  if(action==='home'){state.phase='home';state.variant=null;render({scrollTo:'home'});return;}
  if(state.phase!=='playing')return;
  switch(action){
    case 'toggle-card':toggleCard(id);break;
    case 'toggle-context':state.showContext=!state.showContext;render();break;
    case 'abort':abortDialog.showModal();break;
    case 'cancel-abort':abortDialog.close();break;
    case 'confirm-abort':if(abortDialog.open){abortDialog.close();state.phase='home';state.variant=null;render({scrollTo:'home'});}break;
    case 'choose-person':if(persons().some(s=>s.id===id)){state.suspect=id;state.feedback='';render();}break;
    case 'tab-board':state.tab='board';render({scrollTo:'tabs'});break;
    case 'tab-investigate':state.tab='investigate';render({scrollTo:'tabs'});break;
    case 'accuse':if(state.suspect&&state.evidence.length>=2)accuseDialog.showModal();break;
    case 'cancel-accuse':accuseDialog.close();break;
    case 'confirm-accuse':if(accuseDialog.open){accuseDialog.close();submit();}break;
    case 'hint':if(state.hintLevel<2){state.hintLevel++;render();announce(`ヒント${state.hintLevel}を表示しました。`);}break;
    case 'reveal':revealDialog.showModal();break;
    case 'cancel-reveal':revealDialog.close();break;
    case 'confirm-reveal':if(revealDialog.open){revealDialog.close();reveal();}break;
  }
}
document.addEventListener('click',e=>{
  const button=e.target.closest('button[data-action]');
  if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(state.phase==='playing'&&abortDialog.open&&!['cancel-abort','confirm-abort'].includes(action))return;
  if(state.phase==='playing'&&accuseDialog.open&&!['cancel-accuse','confirm-accuse'].includes(action))return;
  if(state.phase==='playing'&&revealDialog.open&&!['cancel-reveal','confirm-reveal'].includes(action))return;
  handleAction(action,button.dataset.id);
});
setInterval(()=>{if(state.phase!=='playing')return;const clock=document.querySelector('#elapsed-clock');if(clock)clock.textContent=formatTime(elapsed());},1000);
render();
