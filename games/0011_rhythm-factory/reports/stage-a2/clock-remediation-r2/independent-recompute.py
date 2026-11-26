#!/usr/bin/env python3
"""Independent review of native timestamps in the R2 Playwright reporters.

Usage: python3 recompute.py EVIDENCE_DIR > output.json
Uses exact rational arithmetic on JSON number lexemes. Never launches browsers.
"""
from base64 import b64decode
from collections import Counter, defaultdict
from fractions import Fraction
from hashlib import sha256
from math import ceil
from pathlib import Path
from statistics import median
import json
import re
import sys

F = Fraction
REVIEW_SHA = 'b907b41b3e50c0800fe869673d8deaa6a3159164'
BASELINE_SHA = '277d8775ee2a0ef2350b695e89c79a5a0d361847'
RUNTIME_SHA = 'e34e1345e4ecd0fa0b251176f7af64136a46b0ee'
PLANS = {
    'regression': {'natural-24': 9, 'stop-restart-24': 9},
    'firefox-original': {'natural-24': 10, 'stop-restart-24': 3, 'natural-84': 3},
    'firefox-isolated': {'natural-24': 10, 'stop-restart-24': 3, 'natural-84': 3},
    'webkit-approved': {'natural-24': 10, 'stop-restart-24': 3, 'natural-84': 3},
    'webkit-candidate': {'natural-24': 10, 'stop-restart-24': 3, 'natural-84': 3},
    'chromium-approved': {'natural-24': 10, 'stop-restart-24': 3, 'natural-84': 3},
    'chromium-diagnostics': {'natural-24': 2},
    'chromium-84-completion': {'natural-84': 1},
}
PCM_CAPS = {
    'backgroundPeak': 10 ** (-3 / 20),
    'singleSfxPeak': 0.0625,
    'fourSfxPeak': 0.25,
    'mixedFirst100msPeak': 10 ** (-3 / 20) + 0.25,
}


def read(data):
    return json.loads(data, parse_float=F)


def reporter_rows(report):
    for suite in report:
        yield from reporter_rows(suite.get('suites', []))
        for spec in suite.get('specs', []):
            for test in spec['tests']:
                for result in test['results']:
                    raw = None
                    for att in result.get('attachments', []):
                        if att.get('name') in ('a2ar2-playback-raw', 'a2ar-case-05-raw'):
                            raw = read(b64decode(att['body']))
                    if raw is not None or 'track-cycle' in spec['file'] or 'a2ar2-playback' in spec['file'] or 'CASE-05' in spec['title']:
                        yield test['projectName'], spec['title'], result, raw


def finite(value):
    return isinstance(value, (F, int)) and not isinstance(value, bool)


def distribution(seq):
    if not seq:
        return None
    seq = sorted(seq)
    def nearest(p):
        return seq[ceil(p * len(seq))-1]
    return dict(count=len(seq), minimum=seq[0], median=median(seq), p95=nearest(F(95,100)),
                p99=nearest(F(99,100)), maximum=seq[-1])


def pcm_findings(preparation, duration):
    pcm = preparation.get('audioBuffer') or {}
    mix = preparation.get('mix') or {}
    if not pcm:
        return None
    expected_frames = duration*48_000
    expected = {
        'length': expected_frames, 'channels': 2, 'rate': 48_000,
        'pcmBytes': expected_frames * 2 * 4, 'float32': True, 'nonfinite': 0,
    }
    peak = pcm.get('peak')
    blocks = pcm.get('audibleHalfSecondBlocks')
    return dict(observed=pcm, preparationMs=preparation.get('elapsedMs'),
                durationSeconds=duration, expectedFormat=expected,
                formatPass=all(pcm.get(k) == v for k,v in expected.items()),
                backgroundPeakPass=finite(peak) and 0 < peak <= PCM_CAPS['backgroundPeak'],
                minimumAudibleHalfSecondBlocks=duration*2-1,
                halfSecondCoveragePass=finite(blocks) and blocks >= duration*2-1,
                eventCount=preparation.get('eventCount'), mix=mix,
                testedMixCapsPass={k:finite(mix.get(k)) and 0 < mix[k] <= PCM_CAPS[k]
                                   for k in ('singleSfxPeak','fourSfxPeak','mixedFirst100msPeak')})


def trace(browser, title, reporter, raw):
    suite_status = reporter['status']
    if not raw:
        match = re.search(r'(natural|stop-restart)(?:-(24|84))? trial (\d+)$', title)
        scenario = f'{match[1]}-{match[2] or 24}' if match else 'unknown'
        errors = [re.sub(r'\x1b\[[0-9;]*m','', err.get('message','')).splitlines()[0]
                  for err in reporter.get('errors',[]) if err.get('message')]
        return dict(browser=browser, test=title, reporter=suite_status, outcome='missing-attachment',
                    scenario=scenario, trial=int(match[3]) if match else None, reporterDurationMs=reporter.get('duration'),
                    errors=errors), [], []
    result = raw.get('result') or {}
    generation_anchors = {a['generation']:a for a in result.get('anchors',[])}
    measures, gaps = [], []
    invalid = Counter()
    decisions = Counter()
    last_at = {}
    last_diagnostics = {}
    last_native_stamp = {}
    stopped_generations = set()
    for obs in result.get('samples', []):
        gen = obs['generation']
        at_ms = obs.get('atMs')
        if finite(at_ms) and gen in last_at:
            gaps.append(at_ms - last_at[gen])
        if finite(at_ms):
            last_at[gen] = at_ms
        anchor = generation_anchors.get(gen)
        observation = obs.get('raw') or {}
        stamp = observation.get('raw') or {}
        ct, pt = stamp.get('contextTime'), stamp.get('performanceTime')
        if not anchor:
            invalid['anchor unavailable'] += 1
            continue
        if not finite(ct) or not finite(pt) or ct <= 0 or pt <= 0:
            invalid['native timestamp unavailable or non-positive'] += 1
            continue
        if stamp != obs.get('timestamp'):
            invalid['native timestamp differs from adapter timestamp'] += 1
            continue
        origin_ct = anchor['anchorAudioSec']
        origin_pt = anchor['anchorPerformanceMs']
        # (seconds of native audio advance)*1000 minus native performance advance in ms.
        residual = (ct - origin_ct) * 1000 - (pt - origin_pt)
        previous_ct, previous_pt = last_native_stamp.get(gen, (origin_ct, origin_pt))
        nonadvancing = ct < previous_ct or pt < previous_pt or (ct == previous_ct and pt == previous_pt)
        if gen in stopped_generations:
            expected_error = 'clock.stopped'
        elif nonadvancing:
            expected_error = 'clock.notAdvancing'
        elif abs(residual) > 20:
            expected_error = 'clock.outOfSync'
        else:
            expected_error = None
        if expected_error:
            stopped_generations.add(gen)
        else:
            last_native_stamp[gen] = ct, pt
        allowed = expected_error is None
        product = obs['result']['ok']
        actual_error = obs['result'].get('error', {}).get('messageKey')
        decisions['agree' if allowed == product and expected_error == actual_error else 'disagree'] += 1
        diagnostics = obs.get('chromiumPlayback')
        diagnostic_change = {}
        if diagnostics:
            for key in ('underrunDuration', 'underrunEvents', 'totalDuration'):
                value = diagnostics.get(key)
                previous = last_diagnostics.get(key)
                if finite(value) and finite(previous):
                    diagnostic_change[key] = value - previous
            last_diagnostics = diagnostics
        measures.append(dict(n=obs['sampleNumber'], generation=gen, sampleAtMs=at_ms,
                             signedMs=residual, absoluteMs=abs(residual), exactSignedMs=str(residual),
                             thresholdAllows=abs(residual) <= 20, expectedErrorKey=expected_error,
                             expectedProductAllows=allowed, observedProductAllows=product,
                             productError=obs['result'].get('error'),
                             anchorContextSec=origin_ct, anchorPerfMs=origin_pt,
                             nativeContextSec=ct, nativePerfMs=pt, nativeCurrentTimeSec=observation.get('currentTime'),
                             nativeState=observation.get('state'), chromiumPlayback=diagnostics,
                             chromiumPlaybackChangeSincePriorSample=diagnostic_change or None))
    breaches = [row for row in measures if row['absoluteMs'] > 20]
    duration = raw.get('durationSec', 24)
    kind = raw.get('kind', result.get('kind'))
    preparation = result.get('preparation') or {}
    started = [e for e in result.get('sourceEvents',[]) if e['kind'] == 'start']
    native_ended = [e for e in result.get('sourceEvents',[]) if e['kind'] == 'ended']
    natural_runtime = None
    natural_evidence = None
    if result.get('status')=='natural-completed' and len(native_ended)==1 and len(started)==1:
        start, finish = started[0], native_ended[0]
        natural_runtime = finish['atMs'] - start['atMs']
        start_sec = start.get('startSec')
        native_elapsed = finish['contextTime'] - start_sec if finite(start_sec) else None
        natural_evidence = dict(nativeScheduledStartSec=start_sec, nativeEndContextSec=finish['contextTime'],
                                startToEndAudioClockSec=native_elapsed, explicitDurationSec=start.get('durationSec'),
                                nativeBufferDurationSec=start.get('bufferDurationSec'), nativeOffsetSec=start.get('offsetSec'),
                                sameSource=start['sourceId']==finish['sourceId'],
                                stopCount=sum(e['kind']=='stop' for e in result.get('sourceEvents',[])))
    native_diagnostic_rows = [row for row in measures if row['chromiumPlayback']]
    record = dict(browser=browser, version=raw.get('version'), test=title, trial=raw.get('run'), reporter=suite_status,
                  scenario=f'{kind}-{duration}', outcome=result.get('status'), anchorCount=len(generation_anchors),
                  validSamples=len(measures), invalidSamples=dict(invalid), decisions=dict(decisions),
                  rawAnchorResidualMs=distribution([row['absoluteMs'] for row in measures]),
                  sameGenerationIntervalMs=distribution(gaps), breachCount=len(breaches),
                  firstBreach=breaches[0] if breaches else None,
                  worst=max(measures,key=lambda row: row['absoluteMs'],default=None),
                  preparation=pcm_findings(preparation, duration), completedNativeDurationMs=natural_runtime,
                  completedNativeEvidence=natural_evidence,
                  outgoing=raw.get('outgoing'), resourceSnapshots=result.get('resourceSnapshots', []),
                  findings=result.get('findings'),
                  nativeStatsContext=(dict(samples=len(native_diagnostic_rows),
                    performanceTimeOriginMs=result.get('performanceTimeOriginMs'),
                    first=native_diagnostic_rows[0], last=native_diagnostic_rows[-1],
                    positiveUnderrunCounterChanges=[row for row in native_diagnostic_rows if any(
                      (row['chromiumPlaybackChangeSincePriorSample'] or {}).get(key,0)>0
                      for key in ('underrunDuration','underrunEvents'))]) if native_diagnostic_rows else None))
    return record, measures, gaps


def host_correlations(path, trials):
    if not path.is_file():
        return None
    binary = path.read_bytes()
    samples = [read(line) for line in binary.splitlines() if line.strip()]
    matches = []

    def cpu_counters(sample):
        raw = sample.get('cpuStat', '')
        return {key:int(value) for key,value in (line.split() for line in raw.splitlines() if len(line.split())==2)
                if key in ('usage_usec','nr_throttled','throttled_usec') and value.isdigit()}

    for trial in trials:
        diagnostic = trial.get('nativeStatsContext') or {}
        first = trial.get('firstBreach') or {}
        clock_origin = diagnostic.get('performanceTimeOriginMs')
        at = first.get('sampleAtMs')
        if not finite(clock_origin) or not finite(at):
            continue
        epoch = clock_origin + at
        earlier = next((sample for sample in reversed(samples) if sample['epochMs'] <= epoch), None)
        later = next((sample for sample in samples if sample['epochMs'] > epoch), None)
        if earlier is None or later is None:
            continue
        a,b = cpu_counters(earlier),cpu_counters(later)
        matches.append(dict(trial=trial['trial'], sampleNumber=first['n'], sampleEpochMs=epoch,
                            earlierOffsetMs=earlier['epochMs']-epoch, laterOffsetMs=later['epochMs']-epoch,
                            pressureBefore=earlier.get('cpuPressure'),pressureAfter=later.get('cpuPressure'),
                            cgroupCounterChanges={k:b[k]-a[k] for k in sorted(a.keys() & b.keys())},
                            note='Host counters are aggregated observations, not causal evidence.'))
    return dict(sourceSha256=sha256(binary).hexdigest(), sampleCount=len(samples), aroundFirstBreach=matches)


def condition(path, plan):
    if not path.exists() or not path.stat().st_size:
        return dict(plan=plan, reporterStatus='UNAVAILABLE', executed=0, unexecuted=sum(plan.values()))
    binary = path.read_bytes()
    data = read(binary)
    bucket = defaultdict(lambda: {'rows':[],'measures':[],'gaps':[]})
    all_trials = []
    for item in reporter_rows(data['suites']):
        trial, measures, gaps = trace(*item)
        digest = bucket[(item[0], trial.get('scenario','missing-attachment'))]
        digest['rows'].append(trial)
        digest['measures'].extend(measures)
        digest['gaps'].extend(gaps)
        all_trials.append(trial)
    groups = {}
    for (engine, scenario), digest in bucket.items():
        rows, measures, gaps = digest['rows'], digest['measures'], digest['gaps']
        prep = [x['preparation'] for x in rows if x.get('preparation')]
        capture_times = [x['preparationMs'] for x in prep if finite(x['preparationMs'])]
        groups[f'{engine}:{scenario}'] = dict(trials=len(rows), outcomes=dict(Counter(x['outcome'] for x in rows)),
            validSamples=len(measures), invalidSamples=sum(sum(x.get('invalidSamples',{}).values()) for x in rows),
            productMatches=sum(x.get('decisions',{}).get('agree',0) for x in rows),
            productMismatches=sum(x.get('decisions',{}).get('disagree',0) for x in rows),
            over20=sum(x.get('breachCount',0) for x in rows),
            rawAnchorResidualMs=distribution([row['absoluteMs'] for row in measures]),
            sameGenerationIntervalMs=distribution(gaps),
            generationMs=distribution(capture_times),
            fixtureGenerationWithinReferenceCaps=(median(capture_times)<=5000 and max(capture_times)<=10000)
                                                 if len(capture_times)>=3 else None,
            backgroundPeak=distribution([x['observed']['peak'] for x in prep if finite(x['observed'].get('peak'))]),
            confirmedPcmAndMixCases=sum(all((x['formatPass'],x['backgroundPeakPass'],x['halfSecondCoveragePass'],
                                         all(x['testedMixCapsPass'].values()))) for x in prep),
            completedNativeDurationMs=distribution([x['completedNativeDurationMs'] for x in rows
                                                     if x.get('completedNativeDurationMs') is not None]))
    recorded_sha = path.with_name('input-sha.txt')
    return dict(plan=plan, reporterSha256=sha256(binary).hexdigest(),
                inputSha=recorded_sha.read_text().strip() if recorded_sha.exists() else BASELINE_SHA if path.parent.name=='regression' else None,
                reporterStats=data['stats'], executed=len(all_trials), unexecuted=max(0,sum(plan.values())-len(all_trials)),
                executedWithMissingAttachments=sum(t['outcome']=='missing-attachment' for t in all_trials),
                groups=groups, trials=all_trials,
                optionalHostBrackets=host_correlations(path.with_name('host-samples.jsonl'),all_trials))


def convert_fraction(value):
    if isinstance(value,F):
        return float(value)
    raise TypeError(f'Cannot serialize {type(value).__name__}')


if len(sys.argv)!=2:
    sys.exit('Usage: python3 recompute.py EVIDENCE_DIR')
root = Path(sys.argv[1]); results = {name:condition(root/name/'playwright.json', plan) for name,plan in PLANS.items()}
print(json.dumps(dict(reviewSha=REVIEW_SHA, r2StartCommit=BASELINE_SHA, runtimeSourceCommit=RUNTIME_SHA, residualCalculation=
     '(native context sec − generation anchor context sec) × 1000 − (native performance ms − generation anchor performance ms). Rule: abs(residual) ≤ 20 ms after checking that the native timestamp advances. Exact rational input and rule, displayed numeric summaries round to nearest binary float. Percentiles are nearest rank.',
     pcmCaps=PCM_CAPS, fixtureGenerationReferenceMs={'median':5000,'maximum':10000,'minimumCases':3}, results=results), default=convert_fraction, indent=2))
