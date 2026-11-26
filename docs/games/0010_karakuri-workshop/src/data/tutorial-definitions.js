const practiceBoards = [
  {profile: "EDIT", steps: [1, 2, 3, 4, 5, 6], ball: [3, 1.5], goal: [19, 18], fixed: [["R", 5, 4, 15]], walls: [], inventory: [2, 1, 1, 1], objective: {}, resumePrePlacedByStep: {"4": [["R", 11, 10, 0]], "5": [["R", 13, 10, 0]], "6": [["R", 13, 10, 15]]}},
  {profile: "CLOCK", steps: [7], ball: [20, 12.5], goal: [32, 20], fixed: [["P", 20, 15, 0]], walls: [], inventory: [0, 0, 0, 0], objective: {}},
  {profile: "RETRY", steps: [8], ball: [3, 1.5], goal: [19, 18], fixed: [["R", 5, 4, 15]], walls: [], inventory: [1, 0, 0, 0], objective: {"R": 1}},
  {profile: "PLATFORM", steps: [9], ball: [4, 1.5], goal: [25, 20], fixed: [["R", 6, 4, 15]], walls: [], inventory: [2, 2, 0, 0], prePlaced: [["R", 18, 12, 30]], objective: {"P": 1}},
  {profile: "SPRING", steps: [10], ball: [6, 19], goal: [21, 14], fixed: [], walls: [[13, 23, 2, 14]], inventory: [2, 1, 1, 0], objective: {"B": 1}},
  {profile: "SEESAW", steps: [11], ball: [13, 4], goal: [25, 21], fixed: [], walls: [[5, 19, 4, 2]], inventory: [2, 2, 0, 1], prePlaced: [["P", 17, 15, 0]], objective: {"S": 1}},
  {profile: "GRADUATION", steps: [12], ball: [13, 3], goal: [32, 13], fixed: [], walls: [[22, 25, 2, 10]], inventory: [0, 0, 2, 2], objective: {"S": 1, "B": 1}},
];

export const lessons = Object.freeze([
  ['工房紹介', '「遊び方」を開いて読んだら、閉じて盤面の操作に戻りましょう。', 'help'],
  ['道具箱', '道具箱から坂道を選んでください。まだ配置はしません。', 'stock'],
  ['パーツ配置', '坂道を横11・縦10に水平に置いて、配置を確定しましょう。', 'stock'],
  ['移動・ドラッグ', '矢印で坂道を右へ1マス動かし、次に横13・縦10へドラッグしてください。座標入力でも確定できます。', 'board'],
  ['回転', '坂道を選んで、時計回りに15°回転してください。', 'parts'],
  ['削除・Undo', '坂道を削除し、「元に戻す」で同じ場所に戻しましょう。', 'parts'],
  ['開始・停止・再開', '実験を始めて、球が動き出したら一時停止し、再開してください。', 'start-button'],
  ['失敗・軌跡・再挑戦', 'まず何も置かずに実験します。球の軌跡を表示し、坂道を置いてもう一度実験してください。', 'start-button'],
  ['足場', '準備した坂道から球を受ける足場を、自分で設置してゴールさせてください。', 'stock'],
  ['バネ', 'バネを自分で置いて球を跳ね上げ、谷を越えてゴールさせましょう。', 'stock'],
  ['シーソー', '支点から離れた位置に球が乗るよう、シーソーを置いてゴールさせてください。', 'stock'],
  ['卒業試験', 'バネとシーソーを自分で置き、一度の実験で両方を有効に使ってゴールしてください。', 'stock'],
]);
const unit = .24;
const point = ([gridX,gridY])=>({x:gridX*unit,y:(30-gridY)*unit});
const part = ([type,gridX,gridY,angleDeg],index)=>({type,gridX,gridY,angleDeg,id:`teaching-${index+1}`});

export function tutorialBoard(step) {
  const definition = practiceBoards.find(board=>board.steps.includes(step));
  if (!definition) return null;
  const {profile,ball,goal,fixed,walls,inventory,objective}=definition;
  const built = [...fixed.map(([type,x,y,angleDeg],index)=>({
    ...point([x,y]),gridX:x,gridY:y,angleDeg,type,id:`fixed-${index+1}`,category:'fixed',
  })),...walls.map(([x,y,w,h],index)=>({
    ...point([x,y]),gridX:x,gridY:y,angleDeg:0,type:'W',id:`wall-${index+1}`,
    width:w*unit,height:h*unit,category:'obstacle',
  }))];
  const prep=definition.resumePrePlacedByStep?.[step]??definition.prePlaced??[];
  return {
    stage:{id:'00',name:'ギア博士のからくり講座',profile,ball:point(ball),goal:point(goal),fixed:built,
      inventory:Object.fromEntries(['R','P','B','S'].map((type,index)=>[type,inventory[index]])),
      star3Target:0,required:Object.keys(objective).length?{version:2,counts:{...objective}}:null,
    },
    prep:prep.map(part),objective,
  };
}
