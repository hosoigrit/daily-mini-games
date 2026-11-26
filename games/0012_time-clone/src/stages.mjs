import { defineStage } from "./domain.mjs";

const definitions = [
  {
    id: "1", name: "はじめての分身", tutorialId: "stage-1",
    mapRows: [
      "#########",
      "#S.a.D.G#",
      "#########"
    ],
    doorRules: {"D": {"type": "PRESSURE", "requiredSwitchIds": ["a"]}},
    goldThreshold: 8, silverThreshold: 10
  },
  {
    id: "2", name: "回り道", tutorialId: "stage-2",
    mapRows: [
      "###########",
      "#.....a####",
      "#.#########",
      "#S...D...G#",
      "###########"
    ],
    doorRules: {"D": {"type": "PRESSURE", "requiredSwitchIds": ["a"]}},
    goldThreshold: 15, silverThreshold: 18
  },
  {
    id: "3", name: "同時解錠", tutorialId: "stage-3",
    mapRows: [
      "###########",
      "#..a#######",
      "#.#########",
      "#S...L...G#",
      "###b#######",
      "###########"
    ],
    doorRules: {"L": {"type": "LATCH", "requiredSwitchIds": ["a", "b"]}},
    goldThreshold: 14, silverThreshold: 17
  },
  {
    id: "4", name: "二つの扉", tutorialId: "stage-4",
    mapRows: [
      "###############",
      "#..a....b######",
      "#.#############",
      "#S...A....B..G#",
      "###############"
    ],
    doorRules: {"A": {"type": "PRESSURE", "requiredSwitchIds": ["a"]}, "B": {"type": "PRESSURE", "requiredSwitchIds": ["b"]}},
    goldThreshold: 21, silverThreshold: 25
  },
  {
    id: "5", name: "二つのルート", tutorialId: "stage-5",
    mapRows: [
      "###############",
      "#...a##########",
      "#.#############",
      "#S...A.......G#",
      "#.##########.##",
      "#.b#########.##",
      "#.##########.##",
      "#....B.......##",
      "###############"
    ],
    doorRules: {"A": {"type": "PRESSURE", "requiredSwitchIds": ["a"]}, "B": {"type": "PRESSURE", "requiredSwitchIds": ["b"]}},
    goldThreshold: 17, silverThreshold: 23
  },
  {
    id: "6", name: "最後の連携", tutorialId: "stage-6",
    mapRows: [
      "###############",
      "#..a....c######",
      "#.#############",
      "#S..L....D...G#",
      "##.############",
      "##b############",
      "###############"
    ],
    doorRules: {"L": {"type": "LATCH", "requiredSwitchIds": ["a", "b"]}, "D": {"type": "PRESSURE", "requiredSwitchIds": ["c"]}},
    goldThreshold: 25, silverThreshold: 30
  }
];

export const stages = Object.freeze(definitions.map(defineStage));
