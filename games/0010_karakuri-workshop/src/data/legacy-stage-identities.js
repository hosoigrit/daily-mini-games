import {getLegacyStages} from './stage-definitions.js';

const physicsRulesVersion = '8e69e82e660d20121e8878dc98e91f86a3ed8759e34d7d071f63a8507fb845bd';
const approvedIds = {
  '01': ['c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36',
    '81ac485f061876b5683cf00033a67be4d68afabf792a9af80064c85af6756804'],
  '02': ['3f5cf58d40e42e9aea0f0c092bec56c5025c8686886b4124bf2ba5683caa3390',
    '0c5729d32100654d427e82d956669c2e318b44481d566a9cb3bfae32dfeff8de'],
  '03': ['6e70fbee753402021dc48db343fe7359420e4f05f4380858794aa486791f3fee',
    '35aa413c5cffcd8ebf1b320ec147d00874632c4aba00cc26218fa63c3a0cd37f'],
  '04': ['fda74284d1efb8cabe193401feed97dd4261a7a901abafbf2531f3538a647ba6',
    '91330b0d4ab9b4ff3685c67e9fb8ed051ff06fc7574c7b23f1e42b2a8adb19c6'],
  '05': ['17eed7954b45a1589b1d36818fce15427e15c3c818f53072e5e6283f4ba901e6',
    'ab12d15cfbcb950adc0ff1e6aa79e5b910370333affd93bb0d261595e1eb9ef1'],
  '06': ['0369170da97a4b114a1552c82236f780183904c56ec2a60a9966cee8ea11d916',
    '8d42f75fb86ce456fbb9c0309543a32ca045bc1c33dee5abb181cb1ec84eb2de'],
  '07': ['513ba3c349993575700983457e74a1df598fa872474f83a08b29c9bc9ccebcf8',
    'ae32a083d6714866e5c3b245f449aa00047ef0cd28342b0f2e374d3be91c0924'],
  '08': ['9004e3c62bf4a4fbdad14b4c3a7f4a0f1c9f4d1f18861159e02ee8eeb938ea6d',
    '2be016ff471eed206caaa224e9a0c142a2654d825cfb9f3ff9a31610a1d3bef7'],
  '09': ['190caa51027ee872783219eb12a04c32391d5a31964566c6c7a338b0de25e82e',
    '124fd048598df1c66c41fff92c4d84ad2b7a7b1990c9fd23be23be620d7aa9b6'],
  '10': ['e310b77001484036b2c40212f4aed0a320d03e3f55b4570188ebb0ca510a7a9d',
    '79723c0ddcd058d97d89765d728b79a5eba17b4c3051de5130a19e8300b254ab'],
};

export function getLegacyDesigns() {
  return Object.fromEntries(getLegacyStages().map(stage => {
    const [geometryId, compatibilityId] = approvedIds[stage.id];
    return [stage.id, {stage, identity: {geometryId, compatibilityId, physicsRulesVersion}}];
  }));
}
