import {getStages,getStageIdentity} from './data/stage-definitions.js';
import {getLegacyDesigns} from './data/legacy-stage-identities.js';
import {createGameController} from './app/controller.js';
import {createSaveLock} from './storage/lock-manager.js';
import {createSaveRepository} from './storage/save-repository.js';
import {SAVE_KEY} from './storage/save-validator.js';
import {createUI} from './ui/ui-controller.js';
import {createAudioController} from './presentation/audio-controller.js';

const certifiedHints = {
  "01": [
    {
      "level": 1,
      "text": "坂道の切れ目をつないでみよう。",
      "compatibilityId": "81ac485f061876b5683cf00033a67be4d68afabf792a9af80064c85af6756804"
    },
    {
      "level": 2,
      "text": "固定の坂道の先へ、球が右下に進む角度の坂道を置こう。",
      "compatibilityId": "81ac485f061876b5683cf00033a67be4d68afabf792a9af80064c85af6756804"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "R",
          "gridX": 12,
          "gridY": 10,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "81ac485f061876b5683cf00033a67be4d68afabf792a9af80064c85af6756804"
    }
  ],
  "02": [
    {
      "level": 1,
      "text": "傾きで球の向きを変えよう。",
      "compatibilityId": "0c5729d32100654d427e82d956669c2e318b44481d566a9cb3bfae32dfeff8de"
    },
    {
      "level": 2,
      "text": "固定の坂道から来た球を、左下へ傾く坂道でゴール側へ導こう。",
      "compatibilityId": "0c5729d32100654d427e82d956669c2e318b44481d566a9cb3bfae32dfeff8de"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "R",
          "gridX": 27,
          "gridY": 10,
          "angleDeg": -45
        }
      ],
      "compatibilityId": "0c5729d32100654d427e82d956669c2e318b44481d566a9cb3bfae32dfeff8de"
    }
  ],
  "03": [
    {
      "level": 1,
      "text": "球の落下を、足場で受け止めよう。",
      "compatibilityId": "510bd370c8bba7bcf02ed61496ce18a90a18e2efef58e59769f5d93657a11555"
    },
    {
      "level": 2,
      "text": "固定の坂道から落ちる球を受け、次の坂道へ渡そう。",
      "compatibilityId": "510bd370c8bba7bcf02ed61496ce18a90a18e2efef58e59769f5d93657a11555"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 12,
          "gridY": 9,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "510bd370c8bba7bcf02ed61496ce18a90a18e2efef58e59769f5d93657a11555"
    }
  ],
  "04": [
    {
      "level": 1,
      "text": "谷を越えるには、先に高さを作ろう。",
      "compatibilityId": "44a43e4021176de36e59157daaf5b197d35e2f715c948d57acc33efaeae7d091"
    },
    {
      "level": 2,
      "text": "坂道で球をバネの上へ導き、谷の向こうまで跳ばそう。",
      "compatibilityId": "44a43e4021176de36e59157daaf5b197d35e2f715c948d57acc33efaeae7d091"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 2,
          "gridY": 25,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "44a43e4021176de36e59157daaf5b197d35e2f715c948d57acc33efaeae7d091"
    }
  ],
  "05": [
    {
      "level": 1,
      "text": "高く跳んだ球は、着地まで見届けよう。",
      "compatibilityId": "37f5dd406e0cd92c40bc9cdea505d87c9d1b243fbbea7a0091dfd716f9988572"
    },
    {
      "level": 2,
      "text": "バネから落ちてくる球を、右側の足場で受けよう。",
      "compatibilityId": "37f5dd406e0cd92c40bc9cdea505d87c9d1b243fbbea7a0091dfd716f9988572"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 30,
          "gridY": 12,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "37f5dd406e0cd92c40bc9cdea505d87c9d1b243fbbea7a0091dfd716f9988572"
    }
  ],
  "06": [
    {
      "level": 1,
      "text": "シーソーの支点から離れた場所で球を受けよう。",
      "compatibilityId": "b1c9decad8a0dc66e2094c0a3c661e76d5dbc5199b3f88d21368e99305451868"
    },
    {
      "level": 2,
      "text": "板が傾いた先に、ゴールへ続く坂道を置けるよ。",
      "compatibilityId": "b1c9decad8a0dc66e2094c0a3c661e76d5dbc5199b3f88d21368e99305451868"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "S",
          "gridX": 11,
          "gridY": 9,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "b1c9decad8a0dc66e2094c0a3c661e76d5dbc5199b3f88d21368e99305451868"
    }
  ],
  "07": [
    {
      "level": 1,
      "text": "上の壁の下、下の壁の上に通り道を作ろう。",
      "compatibilityId": "9c5e391b194f20c51dc8eb9a5d3272cb8fb7306327dde2a04bb048ecb439e892"
    },
    {
      "level": 2,
      "text": "シーソーの先で、足場から次の足場に球を渡そう。",
      "compatibilityId": "9c5e391b194f20c51dc8eb9a5d3272cb8fb7306327dde2a04bb048ecb439e892"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 23,
          "gridY": 16,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "9c5e391b194f20c51dc8eb9a5d3272cb8fb7306327dde2a04bb048ecb439e892"
    }
  ],
  "08": [
    {
      "level": 1,
      "text": "最初のバネと別のバネで、二度目に跳ねよう。",
      "compatibilityId": "029741624f8f4390bfa3269d8cf2367955656439c00cf70483cc29ea9af4e89f"
    },
    {
      "level": 2,
      "text": "右側のバネで球を左上のゴールへ折り返そう。",
      "compatibilityId": "029741624f8f4390bfa3269d8cf2367955656439c00cf70483cc29ea9af4e89f"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 32,
          "gridY": 20,
          "angleDeg": -15
        }
      ],
      "compatibilityId": "029741624f8f4390bfa3269d8cf2367955656439c00cf70483cc29ea9af4e89f"
    }
  ],
  "09": [
    {
      "level": 1,
      "text": "バネで跳ねた球を、落下する途中で受けよう。",
      "compatibilityId": "cd67e97d8ac8795ac397bc487958da6ae979fb77648c6f511fa9f1d916ce1b70"
    },
    {
      "level": 2,
      "text": "シーソーで送った球をバネで跳ばし、右側の足場へつなごう。",
      "compatibilityId": "cd67e97d8ac8795ac397bc487958da6ae979fb77648c6f511fa9f1d916ce1b70"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 29,
          "gridY": 7,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "cd67e97d8ac8795ac397bc487958da6ae979fb77648c6f511fa9f1d916ce1b70"
    }
  ],
  "10": [
    {
      "level": 1,
      "text": "坂道からボールを渡す順番を考えよう。",
      "compatibilityId": "ba35cc72d042290895b4bef1c590671661ecf58854938ff7f3737788be6ae317"
    },
    {
      "level": 2,
      "text": "シーソーからバネに渡し、跳ねた球を右側の足場へ導こう。",
      "compatibilityId": "ba35cc72d042290895b4bef1c590671661ecf58854938ff7f3737788be6ae317"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 30,
          "gridY": 7,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "ba35cc72d042290895b4bef1c590671661ecf58854938ff7f3737788be6ae317"
    }
  ]
};

async function launch(){
  const stages=getStages();
  const identities=Object.fromEntries(await Promise.all(stages.map(async s=>[s.id,await getStageIdentity(s)])));
  const designs=Object.fromEntries(stages.map(stage=>[stage.id,{stage,identity:identities[stage.id]}]));
  const back={
    getItem:key=>globalThis.localStorage.getItem(key),
    setItem:(key,value)=>globalThis.localStorage.setItem(key,value),
    keys:()=>Array.from({length:globalThis.localStorage.length},(_,index)=>globalThis.localStorage.key(index)),
  };
  const storage=createSaveRepository({storage:back,lock:createSaveLock(navigator.locks),designs,legacyDesigns:getLegacyDesigns()});
  await storage.start();
  const sound=createAudioController();
  sound.configure(storage.read().data.settings);
  let game=null;
  const change=createUI(()=>game);
  game=createGameController({stages,identities,hints:certifiedHints,storage,sound,change});
  const audioNotice=document.getElementById('audio-notice');
  for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>{
    sound.gesture().then(()=>{audioNotice.hidden=!sound.unavailable();});
  },{capture:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)game.hidden();
    else{storage.reconcile();change(game.state());}
  });
  if(screen.orientation?.addEventListener)screen.orientation.addEventListener('change',()=>game.rotated());
  else addEventListener('orientationchange',()=>game.rotated());
  addEventListener('pagehide',()=>{game.detached();storage.release();});
  addEventListener('pageshow',async e=>{
    if(e.persisted&&await storage.start()){
      sound.configure(storage.read().data.settings);
      game.restoreView();
    }
  });
  addEventListener('storage',e=>{
    if(e.key===SAVE_KEY&&storage.notify(e.newValue))change(game.state());
  });
  document.getElementById('game').setAttribute('aria-busy','false');
  change(game.state());
}
launch().catch(()=>{
  document.getElementById('game').setAttribute('aria-busy','false');
  document.getElementById('startup-error').hidden=false;
});
