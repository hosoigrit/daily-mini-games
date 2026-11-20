const rawStages = [
  {
    id: 1,
    size: 4,
    start: [0, 0],
    goal: [3, 3],
    parcels: [[1, 2]],
    walls: [],
    exampleRoute: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 3], [3, 3]],
  },
  {
    id: 2,
    size: 4,
    start: [0, 0],
    goal: [3, 3],
    parcels: [[0, 2], [2, 1]],
    walls: [[1, 1]],
    exampleRoute: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [3, 1], [3, 2], [3, 3]],
  },
  {
    id: 3,
    size: 5,
    start: [0, 0],
    goal: [4, 4],
    parcels: [[1, 3], [3, 3]],
    walls: [[0, 2], [2, 1], [2, 2], [4, 2]],
    exampleRoute: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 4], [4, 4]],
  },
  {
    id: 4,
    size: 5,
    start: [0, 0],
    goal: [4, 4],
    parcels: [[2, 1], [3, 3]],
    walls: [[0, 1], [0, 3], [1, 3], [2, 3], [3, 1], [4, 1]],
    exampleRoute: [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4]],
  },
  {
    id: 5,
    size: 6,
    start: [0, 0],
    goal: [5, 5],
    parcels: [[0, 2], [2, 2], [4, 4]],
    walls: [[1, 1], [1, 4], [2, 1], [2, 4], [3, 1], [4, 1], [4, 3], [5, 3]],
    exampleRoute: [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 2], [3, 2], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5]],
  },
  {
    id: 6,
    size: 6,
    start: [0, 0],
    goal: [5, 5],
    parcels: [[0, 2], [2, 3], [4, 4]],
    walls: [[0, 3], [0, 4], [2, 0], [2, 1], [3, 0], [3, 2], [4, 1], [4, 2], [5, 2], [5, 3]],
    exampleRoute: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [2, 3], [1, 3], [1, 4], [2, 4], [3, 4], [3, 3], [4, 3], [4, 4], [5, 4], [5, 5]],
  },
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const STAGES = deepFreeze(rawStages);

export function getStage(stageId) {
  return STAGES.find((stage) => stage.id === Number(stageId)) ?? null;
}

