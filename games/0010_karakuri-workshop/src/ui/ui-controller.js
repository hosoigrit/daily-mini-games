import {calculateInventory} from '../domain/placement-validator.js';
import {bindBoardInput,editRotation,editWithDirection} from './input-controller.js';
import {createCanvasRenderer} from './canvas-renderer.js';
import {createCharacterGuide} from '../presentation/character-controller.js';

const labels={R:'坂道',P:'足場',B:'バネ',S:'シーソー',slope:'傾斜坂道'};
const saveText={SAVED:'保存済み',UNSAVED:'未保存',UNKNOWN:'保存結果が不明',CONFLICT:'他のタブで更新されました',
  TEMPORARY:'一時プレイ',RECOVERY_REQUIRED:'保存データの復旧が必要'};
const el=id=>document.getElementById(id);
const element=(tag,text)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
};

export function createUI(getGame) {
  const canvas=el('board');
  const draw=createCanvasRenderer(canvas);
  const portraits=createCharacterGuide(el('guide'));
  let latest=null,previousEditor=null,previousStage=null,previousDialog=null,previousProgress=null,opener=null;
  const gameProxy={state:()=>getGame().state(),dispatch:command=>getGame().dispatch(command)};
  const act=command=>gameProxy.dispatch(command);
  const button=(label,action)=>{
    const b=element('button',label);
    b.type='button';
    b.addEventListener('click',action);
    return b;
  };
  bindBoardInput(canvas,gameProxy);
  const modal=el('game-dialog');
  modal.addEventListener('cancel',event=>{event.preventDefault();act({type:'close-dialog'});});

  function outcomes(s){
    if(previousProgress===s.progress)return;
    previousProgress=s.progress;
    const cards=s.stages.map(stage=>{
      const li=element('li');
      const b=button('',()=>act({type:'stage',id:stage.id}));
      const available=s.unlocked.includes(stage.id);
      const stars=s.progress.stages[stage.id].progress.historicalBestStars;
      b.disabled=!available;
      b.append(element('span',`${stage.id}　${stage.name}`));
      const note=element('span',available?(stars===null?'歴代の星 不明':`歴代の星 ${stars} / 3`):'🔒 前のステージをクリア');
      note.className='stage-note';
      b.append(note);li.append(b);return li;
    });
    el('stage-list').replaceChildren(...cards);
  }
  function editPanel(s){
    if(!s.editor||s.editor===previousEditor&&s.stage===previousStage)return;
    previousEditor=s.editor;previousStage=s.stage;
    const left=calculateInventory(s.stage,s.editor.placements);
    const stock=Object.entries(left).map(([type,n])=>{
      if(s.stage.inventory[type]===0)return null;
      const b=button(`${labels[type]} ×${n}`,()=>act({type:'new-part',partType:type}));
      b.disabled=n===0;
      b.setAttribute('aria-pressed',String(s.editor.selection.draft?.type===type));
      return b;
    }).filter(Boolean);
    el('stock').replaceChildren(...stock);
    const choices=[new Option('選択なし',''),...s.editor.placements.map(p=>
      new Option(`${labels[p.type]}　横${p.gridX} 縦${p.gridY}　${p.angleDeg}°`,p.id))];
    el('parts').replaceChildren(...choices);
    el('parts').value=s.editor.selection.id??'';
    const part=s.editor.selection.draft??s.editor.placements.find(p=>p.id===s.editor.selection.id);
    if(part?.gridX!==undefined){el('grid-x').value=part.gridX;el('grid-y').value=part.gridY;}
    el('best-button').disabled=!s.editor.best;
    el('edit-confirm').hidden=s.editor.selection.state!=='CONFIRMING';
    el('edit-confirm-text').textContent=s.editor.selection.operation==='reset'?'配置と軌跡を消去します。':'現在の配置をベスト配置で置き換えます。';
    el('start-button').disabled=s.editor.selection.state==='CONFIRMING';
    el('place-coordinate').disabled=!part;
  }
  function dialog(s){
    if(previousDialog===s.dialog)return;
    if(!s.dialog){
      if(modal.open)modal.close();
      opener?.focus();
      opener=null;previousDialog=null;return;
    }
    previousDialog=s.dialog;
    let title='',content=[],actions=[button('閉じる',()=>act({type:'close-dialog'}))];
    const text=value=>element('p',value);
    switch(s.dialog.type){
      case 'HELP':
        title='遊び方';
        content=[text('道具箱からパーツを選び、盤面をタップするか座標を指定して配置します。'),
          text('実験を始め、球をゴールの中で止めましょう。指定パーツがあるステージでは有効な使い方が必要です。'),
          text('Tabで操作を選べます。盤面では矢印で移動、QとEで回転、Ctrl+Zで元に戻します。')];
        break;
      case 'SETTINGS':{
        title='設定';
        const volume=document.createElement('input');
        volume.type='range';volume.min=0;volume.max=1;volume.step=.05;volume.value=s.progress.settings.volume;
        const volumeLabel=element('label','音量');
        volumeLabel.append(volume);
        volume.addEventListener('change',()=>act({type:'setting',key:'volume',value:Number(volume.value)}));
        const mute=document.createElement('input');
        mute.type='checkbox';mute.checked=s.progress.settings.muted;
        const muteLabel=element('label','ミュート');muteLabel.prepend(mute);
        mute.addEventListener('change',()=>act({type:'setting',key:'muted',value:mute.checked}));
        content=[volumeLabel,muteLabel,text(saveText[s.save.status]??'一時プレイ')];
        actions.unshift(button('保存データを初期化',()=>act({type:'reset-request'})));
        break;
      }
      case 'SAVE_RESET':
        title='保存データの初期化';
        content=[text('この工房の配置、星、解放状況、設定を消去します。')];
        actions=[button('初期化する',()=>act({type:'reset-confirm'})),button('取り消す',()=>act({type:'settings'}))];
        break;
      case 'ACHIEVEMENTS':{
        title='達成状況';
        const rows=Object.values(s.progress.stages);
        const clear=rows.filter(r=>r.progress.cleared).length;
        const stars=rows.reduce((n,r)=>n+(r.progress.historicalBestStars??0),0);
        content=[text(`全ステージクリア　${clear} / 10`),text(`歴代の星　${stars} / 30`)];
        if(rows.some(r=>r.progress.historicalBestStars===null))content.push(text('不明な星があるステージがあります。'));
        break;
      }
      case 'HINT':
        title='ギア博士のヒント';
        content=[text(s.dialog.hint?.text??(s.dialog.hint?'盤面に配置の例を表示しました。':'この設定で使える認定ヒントがありません。'))];
        actions=[1,2,3].map(level=>button(`レベル ${level}`,()=>act({type:'hint',level}))).concat(actions);
        break;
      case 'HINT_CONFIRM':
        title='配置例を見る';
        content=[text('盤面に配置の例を表示します。')];
        actions=[button('表示する',()=>act({type:'hint-confirm'})),button('取り消す',()=>act({type:'hint-cancel'}))];
        break;
    }
    el('dialog-title').textContent=title;
    el('dialog-content').replaceChildren(...content);
    el('dialog-actions').replaceChildren(...actions);
    if(!modal.open){opener=document.activeElement;modal.showModal();}
    actions[0]?.focus();
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');
    if(!target||!latest)return;
    if(target.dataset.direction){editWithDirection(gameProxy,target.dataset.direction.split(',').map(Number));return;}
    if(target.dataset.rotate){editRotation(gameProxy,Number(target.dataset.rotate));return;}
    const command=target.dataset.command;
    if(command==='delete')act({type:command,id:latest.editor?.selection.id});
    else if(command)act({type:command});
  });
  el('parts').addEventListener('change',event=>act({type:'select',id:event.target.value}));
  el('place-coordinate').addEventListener('click',()=>{
    const {selection}=latest.editor;
    const gridX=el('grid-x').valueAsNumber,gridY=el('grid-y').valueAsNumber;
    if(selection.draft)act({type:'commit-draft',id:selection.id??'k-'+crypto.randomUUID().slice(0,16),gridX,gridY});
    else if(selection.id)act({type:'move',id:selection.id,gridX,gridY});
  });
  el('next-stage').addEventListener('click',()=>{
    const next=String(Number(latest.stage.id)+1).padStart(2,'0');
    act({type:'stage',id:next});
  });
  el('workbench').addEventListener('keydown',event=>{
    if(!latest||latest.screen!=='DESIGN'||event.target.matches('input,select')||modal.open)return;
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    let handled=true;
    if(directions[event.key])editWithDirection(gameProxy,directions[event.key]);
    else if(event.key.toLowerCase()==='q')editRotation(gameProxy,-15);
    else if(event.key.toLowerCase()==='e')editRotation(gameProxy,15);
    else if(event.key==='Delete')act({type:'delete',id:latest.editor?.selection.id});
    else if(event.key==='Escape')act({type:'cancel'});
    else if(event.key.toLowerCase()==='z'&&(event.ctrlKey||event.metaKey))act({type:'undo'});
    else if(event.key===' '&&event.target===canvas)act({type:'start'});
    else handled=false;
    if(handled)event.preventDefault();
  });
  new ResizeObserver(()=>{if(latest)draw(latest);}).observe(canvas);
  return function render(s){
    latest=s;
    el('title-screen').hidden=s.screen!=='TITLE';
    el('stage-screen').hidden=s.screen!=='STAGES';
    const work=s.stage&&['DESIGN','RUNNING','PAUSED','CLEARED','FAILED','ERROR'].includes(s.screen);
    el('workbench').hidden=!work;
    if(s.screen==='STAGES')outcomes(s);
    if(work){
      el('stage-title').textContent=`${s.stage.id}　${s.stage.name}`;
      el('save-state').textContent=saveText[s.save.status]??'一時プレイ';
      el('edit-panel').hidden=s.screen!=='DESIGN';
      el('run-panel').hidden=!['RUNNING','PAUSED'].includes(s.screen);
      el('result-panel').hidden=!['CLEARED','FAILED','ERROR'].includes(s.screen);
      el('run-heading').textContent=s.screen==='PAUSED'?'一時停止':'実験中';
      el('pause-reason').textContent=s.screen==='PAUSED'?s.pauseReason:'';
      el('pause-button').hidden=s.screen!=='RUNNING';
      el('resume-button').hidden=s.screen!=='PAUSED';
      el('run-time').value=`${((s.current?.tick??0)/60).toFixed(2)} 秒`;
      el('required').textContent=s.stage.required?`${labels[s.stage.required]} ${s.current?.requiredUse?'達成':'必須'}`:'必須パーツなし';
      el('board-notice').textContent=s.notice;
      el('trail-button').setAttribute('aria-pressed',String(s.showTrail));
      el('result-heading').textContent=s.screen==='CLEARED'?'クリア！':s.screen==='ERROR'?'実験エラー':'実験失敗';
      el('result-details').textContent=s.screen==='CLEARED'?`星 ${s.result?.stars} / 3　使用 ${s.editor.placements.length} 個`:s.failure??'';
      el('next-stage').hidden=s.screen!=='CLEARED'||s.stage.id==='10';
      editPanel(s);
      portraits(s);
      draw(s);
    }
    dialog(s);
  };
}
