'use strict';

const {stop} = require('./policy.js');

const stages = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'];
const origins = new Map([['commonPhysics', 'E1'], ['stageDefinition', 'E6'], ['save', 'E7']]);
// The spring contract explicitly excludes E4, which validates the board rather than the spring.
const springDependent = ['E3', 'E5', 'E6', 'E7', 'E8'];

function invalidateAffectedGates({kind, activeStage, changeAuthorized, separatePhysicsApproval, commonPhysicsFrozen, gates}) {
  const origin = origins.get(kind);
  const activeIndex = stages.indexOf(activeStage);
  if ((!origin && kind !== 'spring') || activeIndex < 0) stop('LS-01', 'Change impact is not covered by the engineering contract.');
  if (changeAuthorized !== true) stop('LS-08', 'The change must be authorized before reopening affected gates.');
  if (kind === 'commonPhysics' && typeof commonPhysicsFrozen !== 'boolean') {
    stop('LS-01', 'The recorded freeze state of shared physics is unknown.');
  }
  const needsPhysicsApproval = kind === 'commonPhysics'
    && (commonPhysicsFrozen === true || activeIndex > stages.indexOf('E5'));
  if (needsPhysicsApproval && separatePhysicsApproval !== true) {
    stop('LS-08', 'Changing shared physics after E5 needs a separate approval.');
  }
  const affected = kind === 'spring' ? springDependent : stages.slice(stages.indexOf(origin));
  return {reopened: [...affected], gates: {...gates,
    ...Object.fromEntries(affected.map(stage => [stage, 'STALE'])),
  }};
}

module.exports = {invalidateAffectedGates};
