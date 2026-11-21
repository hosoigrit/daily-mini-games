import { FAILURE_DIRECTIONS, QUEUE_KEYS } from "./config.mjs";

export function processPassages(snapshot, directions, tick) {
  const queues = { ...snapshot.queues };
  let passedVehicles = snapshot.passedVehicles;
  const events = [];
  for (const direction of ["N", "S", "E", "W"]) {
    if (!directions.includes(direction)) continue;
    const key = QUEUE_KEYS[direction];
    if (queues[key] > 0) {
      queues[key] -= 1;
      passedVehicles += 1;
      events.push({ type: "VEHICLE_PASSED", tick, direction });
    }
  }
  return { queues, passedVehicles, events };
}

export function processArrivals(snapshot, schedule, tick, config) {
  const queues = { ...snapshot.queues };
  let spawnCursor = snapshot.spawnCursor;
  let arrivalAttempts = snapshot.arrivalAttempts;
  let overflowVehicles = snapshot.overflowVehicles;
  let maxQueueLength = snapshot.maxQueueLength;
  const events = [];
  let terminal = null;

  while (spawnCursor < schedule.length && schedule[spawnCursor].spawnTick === tick) {
    const event = schedule[spawnCursor];
    spawnCursor += 1;
    arrivalAttempts += 1;
    const key = QUEUE_KEYS[event.direction];
    if (queues[key] >= config.maxQueuePerDirection) {
      overflowVehicles = 1;
      events.push({ type: "QUEUE_OVERFLOW", tick, eventId: event.eventId, direction: event.direction });
      terminal = { result: "GRIDLOCK", failureDirection: FAILURE_DIRECTIONS[event.direction] };
      break;
    }
    queues[key] += 1;
    maxQueueLength = Math.max(maxQueueLength, queues[key]);
    events.push({ type: "VEHICLE_ARRIVED", tick, eventId: event.eventId, direction: event.direction });
  }
  return { queues, spawnCursor, arrivalAttempts, overflowVehicles, maxQueueLength, events, terminal };
}
