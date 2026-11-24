/**
 * Independently authored proof contracts for the 12 fictional mysteries.
 * Do not generate these from variant.culprit: the purpose is to catch a
 * mistakenly edited answer key (IR-02). Actors here refer to the *evidence*
 * that identifies the operator, not the answer-key metadata.
 *
 * This is not an NLP proof: a reviewer must still check the premises,
 * descriptions and inference chain for narrative consistency.
 */
const contract = (facts, moment, actorCards) => Object.freeze({
  requiredFacts: Object.freeze(facts),
  moment,
  actorEvidence: Object.freeze(actorCards),
});

export const PROOF_CONTRACTS = Object.freeze({
  'gem-a': contract(['time','opening','actor'], '14:11', {A03:'ren', A04:'ren'}),
  'gem-b': contract(['time','opening','actor'], '13:53', {B03:'aoi', B04:'aoi'}),
  'gem-c': contract(['before','after','opening','actor'], '13:21', {C04:'sora', C05:'sora'}),
  'man-a': contract(['outside','route','actor'], '15:12', {M103:'mina', M104:'mina'}),
  'man-b': contract(['outside','route','actor'], '16:14', {M203:'toma', M204:'toma'}),
  'man-c': contract(['outside','route','actor'], '14:32', {M303:'haru', M304:'haru'}),
  'clk-a': contract(['before','change','actor'], '17:47', {K103:'yui', K104:'yui'}),
  'clk-b': contract(['before','change','actor'], '17:52', {K203:'akira', K204:'akira'}),
  'clk-c': contract(['before','after','access','actor'], '16:18', {K304:'nao', K305:'nao'}),
  'har-a': contract(['unauthorized','route','actor'], '19:54', {H103:'takumi', H104:'takumi'}),
  'har-b': contract(['unauthorized','route','actor'], '20:07', {H203:'risa', H204:'risa'}),
  'har-c': contract(['before','after','route','actor'], '20:19', {H304:'fumi', H305:'fumi'}),
});
