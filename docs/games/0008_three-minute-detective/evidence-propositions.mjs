/**
 * Independently maintained, machine-readable positive propositions for every
 * fact-bearing evidence card. Neither the answer key nor the on-screen
 * Japanese sentences are used to generate these definitions at runtime.
 *
 * polarity: affirmed | denied; exclusive=true means the cited evidence
 * identifies one unique operator / sole person at that opportunity.
 * The exact narrative baseline is checked separately in approved-narratives.mjs.
 */
const proposition=(fact,time,actor=null,polarity='affirmed',exclusive=false)=>
  Object.freeze({fact,time,actor,polarity,exclusive});
export const EVIDENCE_PROPOSITIONS=Object.freeze({
  'gem-a':Object.freeze({
    A01:proposition('time','14:05'), A02:proposition('opening','14:11'),
    A03:proposition('actor','14:11','ren','affirmed',true),A04:proposition('actor','14:11','ren','affirmed',true)}),
  'gem-b':Object.freeze({
    B01:proposition('time','13:45'), B02:proposition('opening','13:53'),
    B03:proposition('actor','13:53','aoi','affirmed',true),B04:proposition('actor','13:53','aoi','affirmed',true)}),
  'gem-c':Object.freeze({
    C01:proposition('before','13:12'),C02:proposition('after','13:27'),C03:proposition('opening','13:21'),
    C04:proposition('actor','13:21','sora','affirmed',true),C05:proposition('actor','13:21','sora','affirmed',true)}),
  'man-a':Object.freeze({
    M101:proposition('outside','15:19'),M102:proposition('route','15:12'),
    M103:proposition('actor','15:12','mina','affirmed',true),M104:proposition('actor','15:12','mina','affirmed',true)}),
  'man-b':Object.freeze({
    M201:proposition('outside','16:39'),M202:proposition('route','16:14'),
    M203:proposition('actor','16:14','toma','affirmed',true),M204:proposition('actor','16:14','toma','affirmed',true)}),
  'man-c':Object.freeze({
    M301:proposition('outside','16:46'),M302:proposition('route','14:32'),
    M303:proposition('actor','14:32','haru','affirmed',true),M304:proposition('actor','14:32','haru','affirmed',true)}),
  'clk-a':Object.freeze({
    K101:proposition('before','17:35'),K102:proposition('change','17:47'),
    K103:proposition('actor','17:47','yui','affirmed',true),K104:proposition('actor','17:47','yui','affirmed',true)}),
  'clk-b':Object.freeze({
    K201:proposition('before','17:40'),K202:proposition('change','17:52'),
    K203:proposition('actor','17:52','akira','affirmed',true),K204:proposition('actor','17:52','akira','affirmed',true)}),
  'clk-c':Object.freeze({
    K301:proposition('before','16:05'),K302:proposition('after','16:34'),K303:proposition('access','16:18'),
    K304:proposition('actor','16:18','nao','affirmed',true),K305:proposition('actor','16:18','nao','affirmed',true)}),
  'har-a':Object.freeze({
    H101:proposition('unauthorized','20:20'),H102:proposition('route','19:54'),
    H103:proposition('actor','19:54','takumi','affirmed',true),H104:proposition('actor','19:54','takumi','affirmed',true)}),
  'har-b':Object.freeze({
    H201:proposition('unauthorized','20:20'),H202:proposition('route','20:07'),
    H203:proposition('actor','20:07','risa','affirmed',true),H204:proposition('actor','20:07','risa','affirmed',true)}),
  'har-c':Object.freeze({
    H301:proposition('before','20:15'),H302:proposition('after','20:20'),H303:proposition('route','20:19'),
    H304:proposition('actor','20:19','fumi','affirmed',true),H305:proposition('actor','20:19','fumi','affirmed',true)})
});
