import {getStages,getStageIdentity} from './data/stage-definitions.js';
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
      "text": "落下する球はいったん受け止められる。",
      "compatibilityId": "35aa413c5cffcd8ebf1b320ec147d00874632c4aba00cc26218fa63c3a0cd37f"
    },
    {
      "level": 2,
      "text": "固定の坂道の先に足場を置き、その先の坂道へつなごう。",
      "compatibilityId": "35aa413c5cffcd8ebf1b320ec147d00874632c4aba00cc26218fa63c3a0cd37f"
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
      "compatibilityId": "35aa413c5cffcd8ebf1b320ec147d00874632c4aba00cc26218fa63c3a0cd37f"
    }
  ],
  "04": [
    {
      "level": 1,
      "text": "高さの差は跳躍で越えられる。",
      "compatibilityId": "91330b0d4ab9b4ff3685c67e9fb8ed051ff06fc7574c7b23f1e42b2a8adb19c6"
    },
    {
      "level": 2,
      "text": "初めの坂道で球をバネまで導き、壁を越える向きに跳ばそう。",
      "compatibilityId": "91330b0d4ab9b4ff3685c67e9fb8ed051ff06fc7574c7b23f1e42b2a8adb19c6"
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
      "compatibilityId": "91330b0d4ab9b4ff3685c67e9fb8ed051ff06fc7574c7b23f1e42b2a8adb19c6"
    }
  ],
  "05": [
    {
      "level": 1,
      "text": "高さと飛距離の両方を見よう。",
      "compatibilityId": "ab12d15cfbcb950adc0ff1e6aa79e5b910370333affd93bb0d261595e1eb9ef1"
    },
    {
      "level": 2,
      "text": "バネで壁を越えた球を、ゴールの手前で坂道に受け渡そう。",
      "compatibilityId": "ab12d15cfbcb950adc0ff1e6aa79e5b910370333affd93bb0d261595e1eb9ef1"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 7,
          "gridY": 25,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "ab12d15cfbcb950adc0ff1e6aa79e5b910370333affd93bb0d261595e1eb9ef1"
    }
  ],
  "06": [
    {
      "level": 1,
      "text": "支点から離れた場所に球を落とそう。",
      "compatibilityId": "8d42f75fb86ce456fbb9c0309543a32ca045bc1c33dee5abb181cb1ec84eb2de"
    },
    {
      "level": 2,
      "text": "シーソーで右へ向きを変え、先の坂道でゴールへつなごう。",
      "compatibilityId": "8d42f75fb86ce456fbb9c0309543a32ca045bc1c33dee5abb181cb1ec84eb2de"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "R",
          "gridX": 18,
          "gridY": 15,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "8d42f75fb86ce456fbb9c0309543a32ca045bc1c33dee5abb181cb1ec84eb2de"
    }
  ],
  "07": [
    {
      "level": 1,
      "text": "障害物を避ける道は複数ある。",
      "compatibilityId": "ae32a083d6714866e5c3b245f449aa00047ef0cd28342b0f2e374d3be91c0924"
    },
    {
      "level": 2,
      "text": "坂道を何枚かつなぎ、最後の足場でゴールへ向かう球を受けよう。",
      "compatibilityId": "ae32a083d6714866e5c3b245f449aa00047ef0cd28342b0f2e374d3be91c0924"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "P",
          "gridX": 28,
          "gridY": 17,
          "angleDeg": 0
        }
      ],
      "compatibilityId": "ae32a083d6714866e5c3b245f449aa00047ef0cd28342b0f2e374d3be91c0924"
    }
  ],
  "08": [
    {
      "level": 1,
      "text": "一度目の跳躍の着地点を見よう。",
      "compatibilityId": "2be016ff471eed206caaa224e9a0c142a2654d825cfb9f3ff9a31610a1d3bef7"
    },
    {
      "level": 2,
      "text": "最初のバネで右へ送り、次のバネで左のゴールへ跳ばそう。",
      "compatibilityId": "2be016ff471eed206caaa224e9a0c142a2654d825cfb9f3ff9a31610a1d3bef7"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 4,
          "gridY": 27,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "2be016ff471eed206caaa224e9a0c142a2654d825cfb9f3ff9a31610a1d3bef7"
    }
  ],
  "09": [
    {
      "level": 1,
      "text": "一つの仕掛けから次の仕掛けへ球を渡そう。",
      "compatibilityId": "124fd048598df1c66c41fff92c4d84ad2b7a7b1990c9fd23be23be620d7aa9b6"
    },
    {
      "level": 2,
      "text": "シーソーの右側に荷重をかけ、落ちた先のバネでゴールに届かせよう。",
      "compatibilityId": "124fd048598df1c66c41fff92c4d84ad2b7a7b1990c9fd23be23be620d7aa9b6"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 17,
          "gridY": 20,
          "angleDeg": 15
        }
      ],
      "compatibilityId": "124fd048598df1c66c41fff92c4d84ad2b7a7b1990c9fd23be23be620d7aa9b6"
    }
  ],
  "10": [
    {
      "level": 1,
      "text": "飛び越えた後の着地まで考えよう。",
      "compatibilityId": "79723c0ddcd058d97d89765d728b79a5eba17b4c3051de5130a19e8300b254ab"
    },
    {
      "level": 2,
      "text": "バネで壁の下を通し、横向きの坂道でゴール手前に着地させよう。",
      "compatibilityId": "79723c0ddcd058d97d89765d728b79a5eba17b4c3051de5130a19e8300b254ab"
    },
    {
      "level": 3,
      "parts": [
        {
          "type": "B",
          "gridX": 6,
          "gridY": 25,
          "angleDeg": 30
        }
      ],
      "compatibilityId": "79723c0ddcd058d97d89765d728b79a5eba17b4c3051de5130a19e8300b254ab"
    }
  ]
};

async function launch(){
  const stages=getStages();
  const identities=Object.fromEntries(await Promise.all(stages.map(async s=>[s.id,await getStageIdentity(s)])));
  const designs=Object.fromEntries(stages.map(stage=>[stage.id,{stage,identity:identities[stage.id]}]));
  const back={getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};
  const storage=createSaveRepository({storage:back,lock:createSaveLock(navigator.locks),designs});
  await storage.start();
  const sound=createAudioController();
  sound.configure(storage.read().data.settings);
  let game=null;
  const change=createUI(()=>game);
  game=createGameController({stages,identities,hints:certifiedHints,storage,sound,change});
  for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>{
    sound.gesture().then(()=>{if(sound.unavailable())change(game.state());});
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
