#!/usr/bin/env python3
"""Independent recomputation of Stage A-2a-R3 Playwright JSON source exports."""
from base64 import b64decode
from collections import Counter
from fractions import Fraction
from hashlib import sha256
from math import ceil, floor, isclose
from pathlib import Path
from statistics import median
import json
import sys

from jsonschema import Draft202012Validator

F = Fraction


def attachments(suites):
    for suite in suites:
        yield from attachments(suite.get('suites', []))
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                for result in test.get('results', []):
                    for attachment in result.get('attachments', []):
                        if 'body' in attachment and attachment.get('contentType') == 'application/json':
                            yield test['projectName'], spec['title'], result['status'], attachment['name'], b64decode(attachment['body'])


def dist(seq):
    if not seq:
        return None
    ordered = sorted(seq)
    return {'count':len(seq), 'median':median(ordered),
            'p95':ordered[ceil(len(seq)*F(95,100))-1], 'p99':ordered[ceil(len(seq)*F(99,100))-1], 'max':ordered[-1]}


def equal_display(a,b):
    return a is not None and b is not None and isclose(float(a),float(b),rel_tol=0,abs_tol=1e-8) or a is None and b is None


def trial_metrics(trial):
    anchors = {row['generation']:row for row in trial['anchors']}
    problems=[]
    anchor_check = []
    for a in trial['anchors']:
        if a['a0'] != a['contextTime'] or a['p0'] != a['performanceTime']:
            anchor_check.append(a['generation'])
    if anchor_check:
        problems.append(f'Anchor raw mismatch for generations {anchor_check}')
    previous_native = {}
    previous_now = {}
    stopped = set()
    good = []
    invalid = 0
    matches = 0
    breaching=[]
    ownership_ends=[e for e in trial['events'] if e['kind'] in ('natural-end','native-ended')]
    end_verification = []
    for ev in ownership_ends:
        if ev['kind']!='native-ended':
            continue
        detail=json.loads(ev['detail'],parse_float=F); a=trial['anchors'][-1]; rate=48_000
        duration=24 if trial['fixtureId']=='rotation-24' else 84
        expected=floor((duration*1_000_000-a['startSongUs'])*F(rate,1_000_000)+F(1,2))
        played=None if detail['endAudioSec'] is None else floor((detail['endAudioSec']-a['startAudioSec'])*rate+F(1,2))
        delta=None if played is None else played-expected
        matches=(played==detail['playedFrames'] and expected==detail['expectedFrames'] and
                 ('frameDelta' not in detail or delta==detail['frameDelta']) and
                 ('nativeRenderQuantumFrames' not in detail or detail['nativeRenderQuantumFrames']==128))
        if not matches: problems.append('ENDED frame evidence mismatch')
        end_verification.append(dict(matches=matches,recalculatedDeltaFrames=delta,renderQuantum=detail.get('nativeRenderQuantumFrames')))
    for n, o in enumerate(trial['observations'],1):
        gen=o['generation']; a=anchors.get(gen)
        ct,pt=o['contextTime'],o['performanceTime']
        previous = previous_now.get(gen)
        expected_interval = None if previous is None else o['performanceNow'] - previous
        previous_now[gen]=o['performanceNow']
        if not equal_display(expected_interval,o['intervalMs']):
            problems.append(f'observation {n} interval mismatch')
        delta=None
        if a is None:
            expected='anchor-missing-from-export'
        elif o['a0']!=a['a0'] or o['p0']!=a['p0']:
            expected='observation-changed-fixed-anchor'
        elif gen in stopped:
            expected='clock.stopped'
        elif ct is None or pt is None or ct<=0 or pt<=0:
            expected='clock.unavailable'
        else:
            pct,ppt=previous_native.get(gen,(a['a0'],a['p0']))
            delta=(ct-a['a0'])*1000-(pt-a['p0'])
            expected='clock.notAdvancing' if ct<pct or pt<ppt or (ct,pt)==(pct,ppt) else 'clock.outOfSync' if abs(delta)>20 else None
        if expected is not None:
            stopped.add(gen)
        else:
            previous_native[gen]=ct,pt
        is_valid=expected in (None,'clock.outOfSync')
        is_over=expected=='clock.outOfSync'
        if is_valid:
            good.append(abs(delta))
            if not equal_display(delta,o['signedResidualMs']) or not equal_display(abs(delta),o['absoluteDifferenceMs']):
                problems.append(f'observation {n} display residual mismatch')
        else:
            invalid+=1
        if is_over:
            breaching.append(dict(observation=n,generation=gen, performanceNowMs=o['performanceNow'],
                                 signedMs=delta, exactSignedMs=str(delta),a0=a['a0'],p0=a['p0'],contextTime=ct,performanceTime=pt))
        actual=(o['reason'],o['safetyStopReason'],o['valid'],o['overLimit'])
        if actual==(expected,expected,is_valid,is_over):
            matches+=1
        else:
            problems.append(f'observation {n} decision mismatch {actual!r} != {(expected,expected,is_valid,is_over)!r}')
    prepares=[]
    for prep in trial['preparations']:
        sec=24 if trial['fixtureId']=='rotation-24' else 84
        correct=(prep['durationSec']==sec and prep['sampleRate']==48000 and prep['channels']==2
                 and prep['frames']==sec*48000 and prep['pcmBytes']==sec*48000*2*4 and prep['float32']
                 and prep['nonfiniteSamples']==0 and prep['bgmPeak'] is not None and 0 < prep['bgmPeak'] <= 10**(-3/20)
                 and prep['audibleHalfSecondBlocks']>=sec*2-1 and prep['cacheCount']==1
                 and prep['renderingCount']==0 and prep['maxSimultaneousRenders']==1)
        raw_elapsed=prep['completedAtMs']-prep['startedAtMs']
        if not equal_display(raw_elapsed,prep['generationMs']): problems.append('prep timing mismatch')
        prepares.append(dict(pcmPass=correct,elapsedMs=raw_elapsed,frames=prep['frames'],pcmBytes=prep['pcmBytes']))
    return (dict(trialId=trial['trialId'],fixtureId=trial['fixtureId'],status=trial['status'],statusReason=trial.get('reason'),
                anchorCount=len(anchors),decisionMatches=matches,observations=len(trial['observations']),
                valid=len(good),invalid=invalid,distribution=dist(good),firstOver=next(iter(breaching),None),
                overCount=len(breaching),preparations=prepares,released=trial['released'],naturalEndEvents=ownership_ends,endVerification=end_verification,
                problems=problems), good)


def group_metrics(data, trial_results):
    lookup={entry['trialId']:(entry,valid) for entry,valid in trial_results}
    groups=[]
    for group in data.get('groups',[]):
        rows=[lookup[trial_id] for trial_id in group['trialIds'] if lookup[trial_id][0]['status']!='NOT RUN']
        distribution=dist([d for _,valid in rows for d in valid]); s=group['summary']; invalid=sum(x[0]['invalid'] for x in rows)
        over=sum(x[0]['overCount'] for x in rows); first=next((x[0] for x in rows if x[0]['firstOver']),None)
        status_counts=Counter(x[0]['status'] for x in rows)
        matches=s['validObservations']==sum(len(valid) for _,valid in rows) and s['invalidObservations']==invalid and s['overLimitCount']==over
        if distribution:
            matches &= all(equal_display(distribution[key],s['syncDifferenceMs'][key]) for key in distribution)
        else:
            matches &= all(s['syncDifferenceMs'][k] is None for k in ('median','p95','p99','max'))
        if first:
            matches &= s['firstOverLimit']['trialId']==first['trialId'] and s['firstOverLimit']['generation']==first['firstOver']['generation']
        else:
            matches &= s['firstOverLimit'] is None
        matches &= all(s[key]==status_counts[status] for key,status in zip(
            ('successfulTrials','failedTrials','blockedTrials','abortedTrials'),('PASS','FAIL','BLOCKED','ABORTED')))
        groups.append(dict(testCase=group['condition']['testCaseId'],countsMatch=bool(matches),distribution=distribution,
                           invalid=invalid, overCount=over, statuses=status_counts))
    return groups


def examine(path, validator):
    if not path.exists(): return {'reportStatus':'unavailable'}
    binary=path.read_bytes(); reporter=json.loads(binary)
    verified=[]
    other=Counter()
    for project,title,status,name,blob in attachments(reporter['suites']):
        raw=json.loads(blob)
        if 'trials' not in raw:
            other[name]+=1
            continue
        schema_errors=[e.json_path for e in validator.iter_errors(raw)]
        data=json.loads(blob,parse_float=F)
        trials=[trial_metrics(t) for t in data['trials']]
        verified.append(dict(project=project,title=title,testResult=status,attachment=name,attachmentSha256=sha256(blob).hexdigest(),
                             commitIds=sorted({t['qaHarnessCommit'] for t in data['trials']}),schemaErrors=schema_errors,
                             trials=[t[0] for t in trials], groups=group_metrics(data,trials)))
    return dict(reporterSha256=sha256(binary).hexdigest(),playwrightStats=reporter['stats'],
                exports=verified,otherAttachments=other)


root=Path(sys.argv[1]); schema=Path(sys.argv[2])
validator=Draft202012Validator(json.loads(schema.read_bytes()))
browser_reports={env:examine(root/env/'playwright.json',validator) for env in ('dev','preview')}
print(json.dumps(dict(schemaSha256=sha256(schema.read_bytes()).hexdigest(),reports=browser_reports),indent=2,default=float))
