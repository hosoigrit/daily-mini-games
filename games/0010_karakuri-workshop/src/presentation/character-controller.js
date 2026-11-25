const characters={
  luke:{normal:'luke-normal',surprised:'luke-surprised',happy:'luke-happy'},
  gear:{normal:'gear-normal',thinking:'gear-thinking',praise:'gear-praise'},
};

export function createCharacterGuide(host) {
  let previous='';
  return function update(state) {
    const poses=state.dialog?.type==='HINT'||state.dialog?.type==='HINT_CONFIRM'?[characters.gear.thinking]
      :state.screen==='FAILED'?[characters.luke.surprised]
      :state.screen==='CLEARED'?[characters.luke.happy,characters.gear.praise]
      :state.screen==='PAUSED'||state.screen==='ERROR'?[characters.luke.normal]
      :state.screen==='RUNNING'?[]:[characters.luke.normal,characters.gear.normal];
    const key=poses.join();
    if(key===previous)return;
    previous=key;
    const images=poses.map(pose=>{
      const img=document.createElement('img');
      img.alt=pose.startsWith('luke')?'ルーク':'ギア博士';
      img.src='./assets/characters/'+pose+'.svg';
      img.addEventListener('error',()=>{
        const fallback=document.createElement('span');
        fallback.textContent=img.alt;
        img.replaceWith(fallback);
      },{once:true});
      return img;
    });
    host.replaceChildren(...images);
  };
}
