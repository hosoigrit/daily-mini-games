import { useEffect, useRef, useState, useSyncExternalStore, type ComponentPropsWithRef, type Ref } from 'react';
import type { ErrorCode, FinalResult, GameSettings, GameState, Lane, SaveStatus } from '../contracts/interface_contracts';
import type { TrialCommand, TrialRuntime, TrialScreen, TrialSnapshot } from '../contracts/trial-runtime';
import './trial-game.css';

const lanes = [1, 2, 3, 4] as const;
const defaultKeys = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] as const;
const scoreFormat = new Intl.NumberFormat('ja-JP');
const playbackLabel: Record<GameState, string> = {
  READY: '開始待ち', INITIALIZING: '音声と時計の準備中', COUNTDOWN: '開始カウント',
  PREROLL: '開始前の入力受付', PLAYING: '演奏中', PAUSING: '停止処理中',
  PAUSED: '一時停止中', REHOLD_WAIT: '再保持待ち', RESUMING: '再開準備中',
  FINALIZING: '判定を確定中', CLEAR: 'CLEAR', FAILED: 'FAILED',
  ABORTED: '中断', ERROR: '安全停止',
};
const saveLabel: Record<SaveStatus, string> = {
  IDLE: '保存前', PENDING_SAVE: '保存を準備中', SAVING: '保存中', SAVED: '保存済み',
  SAVE_ERROR: '保存を確認できません', DISCARDED: '未保存の結果を破棄しました',
};
const errors: Record<ErrorCode, string> = {
  'ERR-001': '選択した音源を利用できません。',
  'ERR-002': '試験譜面を利用できません。',
  'ERR-003': '音源の準備に失敗しました。もう一度準備してください。',
  'ERR-004': '音声を開始できません。利用環境を確認して再試行してください。',
  'ERR-005': '音声の時刻を確認できません。',
  'ERR-006': '音声と入力の同期を確認できません。',
  'ERR-007': '入力時刻を安全に確定できません。',
  'ERR-008': '現在の状態ではその操作を実行できません。',
  'ERR-009': '別のタブが保存権限を使用しています。',
  'ERR-010': 'この環境では保存ロックを利用できません。',
  'ERR-011': 'このタブに保存権限がありません。',
  'ERR-012': '保存データを読み取れません。元のデータは保持されています。',
  'ERR-013': '保存を確定できません。保存権限と保存状態を確認してください。',
  'ERR-014': '未対応の保存形式です。元のデータは保持されています。',
  'ERR-015': '試験に必要な素材を読み込めません。',
  'ERR-016': '保存済みか確認できません。結果を変更せず再試行できます。',
  'ERR-017': '操作中に内部エラーが発生しました。',
  'ERR-018': '設定または入力データを確認してください。',
};

type Perform = (command: TrialCommand) => void;
type Navigate = (screen: TrialScreen) => void;
type ButtonProps = ComponentPropsWithRef<'button'> & {
  readonly variant?: 'primary' | 'quiet' | 'danger';
};

function Button({ variant, className, type = 'button', ...props }: ButtonProps) {
  const classes = ['trial-button', variant ? `trial-${variant}` : '', className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...props} />;
}

function Heading({ children }: { readonly children: string }) {
  return <h1 id="trial-title" className="trial-heading" tabIndex={-1}>{children}</h1>;
}

function menuButton(navigate: Navigate) {
  return <Button variant="quiet" onClick={() => navigate('MENU')}>メニューへ</Button>;
}

function keyName(code: string): string {
  return code.replace(/^(?:Key|Digit)/, '');
}

function Scoreboard({ ui }: Pick<TrialSnapshot, 'ui'>) {
  return (
    <dl className="trial-scoreboard" aria-label="演奏成績">
      <div><dt>スコア</dt><dd data-stat="score">{scoreFormat.format(ui.score)}</dd></div>
      <div><dt>ライフ</dt><dd data-stat="life">{ui.lifeUnits / 2}</dd></div>
      <div><dt>コンボ</dt><dd data-stat="combo">{scoreFormat.format(ui.combo)}</dd></div>
      <div><dt>最大コンボ</dt><dd data-stat="max-combo">{scoreFormat.format(ui.maxCombo)}</dd></div>
    </dl>
  );
}

function LaneButton({ lane, keyCode, rehold, reheld, ref }: {
  readonly lane: Lane;
  readonly keyCode: string;
  readonly rehold: boolean;
  readonly reheld: boolean;
  readonly ref: Ref<HTMLButtonElement>;
}) {
  const key = keyName(keyCode);
  return (
    <button type="button" ref={ref} className="trial-lane" aria-label={`レーン${lane} ${key}`}
      data-lane={lane} data-rehold={rehold} data-reheld={reheld}>
      <span aria-hidden="true">{lane} <kbd>{key}</kbd></span>
    </button>
  );
}

function PlayView({ runtime, snapshot, perform }: {
  readonly runtime: TrialRuntime;
  readonly snapshot: TrialSnapshot;
  readonly perform: Perform;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLButtonElement>(null);
  const middleLeft = useRef<HTMLButtonElement>(null);
  const middleRight = useRef<HTMLButtonElement>(null);
  const right = useRef<HTMLButtonElement>(null);
  const { ui, screen, countdownSeconds, reheldLanes, judgements, mode } = snapshot;
  const paused = screen === 'PAUSE';
  const practice = mode === 'PRACTICE';
  const keys = snapshot.settings?.keyBindings ?? defaultKeys;
  const judgement = judgements.at(-1);
  const showTiming = snapshot.settings?.showFastSlow !== false;
  const allowPause = !paused && ['COUNTDOWN', 'PREROLL', 'PLAYING', 'FINALIZING'].includes(ui.state);
  const canStart = !practice && (ui.state === 'READY' || (ui.state === 'INITIALIZING' && ui.error?.recoverable));
  const canResume = paused && ui.state === 'PAUSED';
  const canRetry = paused && ui.state === 'PAUSED' && !snapshot.pending;
  const reholding = paused && (ui.state === 'REHOLD_WAIT' || ui.state === 'RESUMING') && ui.reholdLanes.length > 0;

  useEffect(() => {
    const board = canvas.current;
    const buttons = [left.current, middleLeft.current, middleRight.current, right.current] as const;
    const [first, second, third, fourth] = buttons;
    if (!board || !first || !second || !third || !fourth) return;
    return runtime.mountPlayfield(board, [first, second, third, fourth], pressed => {
      buttons.forEach((button, index) => {
        if (button) button.dataset.pressed = String(pressed.includes(lanes[index]!));
      });
    });
  }, [runtime]);

  const controls = (lane: Lane) => ({
    lane, keyCode: keys[lane - 1]!,
    rehold: reholding && ui.reholdLanes.includes(lane), reheld: reholding && reheldLanes.includes(lane),
  });
  const phase = countdownSeconds === null ? playbackLabel[ui.state] : `${playbackLabel[ui.state]} ${countdownSeconds}`;
  return (
    <section className="trial-panel trial-play-panel">
      <div className="trial-toolbar">
        <Heading>{paused ? '一時停止' : practice ? '練習 · 回転灯' : '回転灯'}</Heading>
        <p role="status" data-phase={ui.state}>{phase}</p>
      </div>
      <Scoreboard ui={ui} />
      <progress className="trial-progress" aria-label="試験曲の進み具合" value={snapshot.progress} max={1} />
      <p className="trial-judgement" data-judgement={judgement?.label}>
        {judgements.map((item, index) => (
          <span key={item.id}>{index > 0 ? ' / ' : ''}{item.label}{showTiming && item.timing ? ` · ${item.timing}` : ''}</span>
        ))}
      </p>
      <div className="trial-field" data-testid="trial-playfield">
        <div className="trial-board">
          <canvas className="trial-canvas" ref={canvas} aria-label="4レーンの譜面と判定ライン" />
          {paused && <p className="trial-board-banner">{reholding ? '指定レーンを押したまま再開します' : phase}</p>}
        </div>
        <div className="trial-lanes" aria-label="4レーンの入力">
          <LaneButton ref={left} {...controls(1)} />
          <LaneButton ref={middleLeft} {...controls(2)} />
          <LaneButton ref={middleRight} {...controls(3)} />
          <LaneButton ref={right} {...controls(4)} />
        </div>
      </div>
      {reholding && <p role="status">再保持 {reheldLanes.length} / {ui.reholdLanes.length} · レーン {ui.reholdLanes.join('・')}</p>}
      <div className="trial-actions">
        {canStart && <Button variant="primary" disabled={snapshot.writer !== 'OWNED' || snapshot.pending}
          onClick={() => perform({ kind: 'START_GAME' })}>演奏を始める</Button>}
        {allowPause && <Button variant="quiet" onClick={() => perform({ kind: 'PAUSE_GAME' })}>一時停止</Button>}
        {canResume && <Button variant="primary" disabled={snapshot.writer !== 'OWNED'}
          onClick={() => perform({ kind: 'RESUME_GAME' })}>再開</Button>}
        {canRetry && <Button disabled={snapshot.writer !== 'OWNED'} onClick={() => perform({ kind: 'RETRY_GAME' })}>リトライ</Button>}
        <Button variant="quiet" onClick={() => perform(practice ? { kind: 'SKIP_TUTORIAL' } : { kind: 'ABORT_GAME' })}>
          {practice ? '練習を中断' : '演奏を中断'}
        </Button>
      </div>
    </section>
  );
}

function NotesResult({ result }: { readonly result: FinalResult }) {
  const { counts } = result;
  return (
    <>
      <div className="trial-result-summary">
        <p>ランク <strong>{result.rank}</strong></p>
        <dl className="trial-count-grid" aria-label="判定内訳">
          {[
            ['PERFECT', counts.perfect], ['GREAT', counts.great], ['GOOD', counts.good],
            ['MISS', counts.miss], ['空打ち', counts.ghost], ['未プレイ', counts.unplayed],
          ].map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}
        </dl>
      </div>
    </>
  );
}

function ResultView({ snapshot, perform, navigate }: {
  readonly snapshot: TrialSnapshot;
  readonly perform: Perform;
  readonly navigate: Navigate;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const practice = snapshot.mode === 'PRACTICE';
  const result = snapshot.result;
  const saveStatus = snapshot.ui.saveStatus;
  const ownsWriter = snapshot.writer === 'OWNED';
  const unresolved = snapshot.pending && saveStatus === 'SAVE_ERROR' && result !== null && ownsWriter;
  return (
    <section className="trial-panel">
      <Heading>{practice ? '練習完了' : result?.outcome ?? playbackLabel[snapshot.ui.state]}</Heading>
      {!practice && <Scoreboard ui={snapshot.ui} />}
      {!practice && result && <NotesResult result={result} />}
      {!practice && <p role="status" className="trial-message" data-level={snapshot.pending ? 'warning' : undefined}>
        保存状態 · {saveLabel[saveStatus]}
      </p>}
      {snapshot.pending && <p className="trial-muted">未保存の正式結果は、保存を確認するか明示的に破棄するまで保留されます。</p>}
      <div className="trial-actions">
        <Button variant="primary" disabled={!ownsWriter || snapshot.pending} onClick={() => perform({ kind: 'RETRY_GAME' })}>リトライ</Button>
        {unresolved && <Button onClick={() => perform({ kind: 'RETRY_SAVE' })}>保存を再試行</Button>}
        {unresolved && <Button variant="quiet" onClick={() => setConfirmDiscard(true)}>未保存の結果を破棄</Button>}
        <Button variant="quiet" onClick={() => navigate('MUSIC_SELECT')}>選曲へ</Button>
        {menuButton(navigate)}
      </div>
      {confirmDiscard && unresolved && <div className="trial-message" role="group" aria-label="未保存結果の破棄確認">
        <p>この試行の未保存結果を破棄します。確定済みの記録は保持されます。</p>
        <div className="trial-actions">
          <Button variant="danger" onClick={() => {
            setConfirmDiscard(false);
            perform({ kind: 'DISCARD_RESULT', confirmed: true });
          }}>結果を破棄する</Button>
          <Button variant="quiet" onClick={() => setConfirmDiscard(false)}>キャンセル</Button>
        </div>
      </div>}
    </section>
  );
}

const numberSettings = [
  ['musicVolume', '音楽の音量', 0, 100, 1],
  ['sfxVolume', '効果音の音量', 0, 100, 1],
  ['noteSpeed', 'ノーツ速度', 0.5, 2, 0.1],
  ['timingOffsetMs', 'タイミング補正（ms）', -200, 200, 5],
] as const;

function SettingsForm({ initial, disabled, perform }: {
  readonly initial: GameSettings;
  readonly disabled: boolean;
  readonly perform: Perform;
}) {
  const [settings, setSettings] = useState(initial);

  function update<Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) {
    setSettings(previous => ({ ...previous, [key]: value }));
  }

  function setKey(index: number, text: string) {
    const key = text.toUpperCase();
    const code = /^[A-Z]$/.test(key) ? `Key${key}` : /^\d$/.test(key) ? `Digit${key}` : '';
    const next = [...settings.keyBindings] as [string, string, string, string];
    next[index] = code;
    update('keyBindings', next);
  }

  const canVibrate = typeof navigator.vibrate === 'function';
  const validKeys = settings.keyBindings.every(Boolean) && new Set(settings.keyBindings).size === lanes.length;
  return (
    <form className="trial-settings-form" onSubmit={event => {
      event.preventDefault();
      perform({ kind: 'APPLY_SETTINGS', settings });
    }}>
      <div className="trial-form-grid">
        {numberSettings.map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input className="trial-control" type="number" min={min} max={max} step={step} required
              value={Number.isFinite(settings[key]) ? settings[key] : ''} disabled={disabled}
              onChange={event => update(key, event.currentTarget.valueAsNumber)} />
          </label>
        ))}
        <label>
          描画の負荷
          <select className="trial-control" value={settings.effectQuality} disabled={disabled}
            onChange={event => update('effectQuality', event.currentTarget.value === 'LIGHT' ? 'LIGHT' : 'NORMAL')}>
            <option value="NORMAL">標準</option>
            <option value="LIGHT">軽量</option>
          </select>
        </label>
      </div>
      <fieldset className="trial-key-grid" disabled={disabled}>
        <legend>レーンのキー設定</legend>
        {settings.keyBindings.map((code, index) => (
          <label key={lanes[index]} className="trial-setting-field">
            レーン{lanes[index]}
            <input className="trial-control" type="text" maxLength={1} value={keyName(code)}
              onChange={event => setKey(index, event.currentTarget.value)} />
          </label>
        ))}
      </fieldset>
      <div className="trial-checks">
        <label><input type="checkbox" checked={settings.showFastSlow} disabled={disabled}
          onChange={event => update('showFastSlow', event.currentTarget.checked)} />FAST・SLOWを表示</label>
        <label><input type="checkbox" checked={settings.vibrationEnabled && canVibrate} disabled={disabled || !canVibrate}
          onChange={event => update('vibrationEnabled', event.currentTarget.checked)} />
          {canVibrate ? '振動の利用を許可' : '振動（この環境では利用不可）'}</label>
      </div>
      {!validKeys && <p className="trial-muted">レーンごとに異なる英字または数字を設定してください。</p>}
      <div className="trial-actions">
        <Button type="submit" variant="primary" disabled={disabled || !validKeys}>設定を保存</Button>
        <Button disabled={disabled} onClick={() => perform({ kind: 'RESET_SETTINGS' })}>設定を初期化</Button>
      </div>
    </form>
  );
}

function SettingsView({ snapshot, navigate, perform, enableAudio }: {
  readonly snapshot: TrialSnapshot;
  readonly navigate: Navigate;
  readonly perform: Perform;
  readonly enableAudio: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const disabled = snapshot.writer !== 'OWNED' || snapshot.pending;
  return (
    <section className="trial-panel">
      <Heading>設定</Heading>
      {disabled && <p className="trial-message">このタブでは現在、設定を保存できません。</p>}
      {snapshot.settings && <SettingsForm key={JSON.stringify(snapshot.settings)} initial={snapshot.settings} disabled={disabled} perform={perform} />}
      <hr />
      <div className="trial-actions">
        <Button disabled={snapshot.writer !== 'OWNED'} variant="quiet" onClick={enableAudio}>音声を有効にする</Button>
        <Button disabled={snapshot.writer !== 'OWNED'} onClick={() => perform({ kind: 'START_CALIBRATION' })}>タイミング補正を測る</Button>
      </div>
      <div className="trial-actions">
        <Button disabled={disabled} variant="quiet" onClick={() => setConfirmReset(true)}>進捗を初期化</Button>
        {menuButton(navigate)}
      </div>
      {confirmReset && !disabled && <div className="trial-message" role="group" aria-label="進捗初期化の確認">
        <p>この試験版の成績、コレクション、練習進捗を消去します。設定は保持されます。</p>
        <div className="trial-actions">
          <Button variant="danger" onClick={() => {
            setConfirmReset(false);
            perform({ kind: 'RESET_PROGRESS', confirmed: true });
          }}>進捗を消去する</Button>
          <Button variant="quiet" onClick={() => setConfirmReset(false)}>キャンセル</Button>
        </div>
      </div>}
    </section>
  );
}

const calibrationRetry = {
  INSUFFICIENT: '有効な入力が足りません。設定画面から再計測してください。',
  SPREAD: '入力時刻のばらつきが大きいため、設定画面から再計測してください。',
  OUT_OF_RANGE: '計測値が設定範囲外です。設定画面から再計測してください。',
  INTERRUPTED: '計測を中断しました。',
};

function CalibrationView({ runtime, snapshot, perform }: {
  readonly runtime: TrialRuntime;
  readonly snapshot: TrialSnapshot;
  readonly perform: Perform;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const result = snapshot.calibration;
  const beat = snapshot.calibrationBeat ?? null;

  useEffect(() => {
    const control = button.current;
    if (!control) return;
    return runtime.mountCalibration(control, (pressed: readonly Lane[]) => {
      control.dataset.pressed = String(pressed.length > 0);
    });
  }, [runtime]);

  return (
    <section className="trial-panel">
      <Heading>タイミング補正</Heading>
      <p>16拍の合図に合わせて入力します。最初の4拍は練習です。</p>
      <div className="trial-calibration-grid" aria-hidden="true" data-calibration-beat={beat ?? undefined}>
        {Array.from({ length: 16 }, (_, index) => <span key={index} data-current={index === beat} />)}
      </div>
      {beat !== null && result === null && <p className="trial-muted">{beat + 1} / 16 拍</p>}
      <Button ref={button} className="trial-calibration-input" variant="primary" disabled={result !== null}>拍に合わせて入力</Button>
      {result === null && <p role="status">計測中</p>}
      {result?.kind === 'RETRY' && <p role="status">{calibrationRetry[result.reason]}</p>}
      {result?.kind === 'PROPOSED' && <>
        <p role="status">補正の提案 <strong>{result.proposedOffsetMs} ms</strong> · 有効入力 {result.samples.length} 件</p>
        <Button variant="primary" disabled={snapshot.pending || snapshot.writer !== 'OWNED'}
          onClick={() => perform({ kind: 'APPLY_CALIBRATION', offsetMs: result.proposedOffsetMs, confirmed: true })}>補正を適用</Button>
      </>}
      <div className="trial-actions">
        <Button variant="quiet" onClick={() => perform({ kind: 'STOP_CALIBRATION' })}>設定に戻る</Button>
      </div>
    </section>
  );
}

function CollectionView({ snapshot, navigate }: { readonly snapshot: TrialSnapshot; readonly navigate: Navigate }) {
  const record = snapshot.save?.collection['CHART-01-H'];
  return (
    <section className="trial-panel">
      <Heading>コレクション</Heading>
      {record ? <dl className="trial-count-grid">
        <div><dt>試験譜面</dt><dd>回転灯 · HARD</dd></div>
        <div><dt>最高ランク</dt><dd>{record.bestQuality}</dd></div>
      </dl> : <p className="trial-muted">保存済みの試験記録はありません。</p>}
      <div className="trial-actions">{menuButton(navigate)}</div>
    </section>
  );
}

function MusicView({ snapshot, navigate, perform }: {
  readonly snapshot: TrialSnapshot;
  readonly navigate: Navigate;
  readonly perform: Perform;
}) {
  const { prepared, pending, preview, writer } = snapshot;
  return (
    <section className="trial-panel">
      <Heading>選曲</Heading>
      <article className="trial-track">
        <h2>回転灯</h2>
        <p className="trial-muted">試験曲 · 24秒 · 120 BPM · HARD</p>
        <p role="status">{prepared ? '試験音源の準備完了' : '試験音源を準備中'}</p>
      </article>
      <div className="trial-actions">
        <Button variant="quiet" onClick={() => perform({ kind: 'SELECT_TRACK', musicId: 'music-01' })}>音源を準備</Button>
        {preview
          ? <Button onClick={() => perform({ kind: 'STOP_PREVIEW' })}>試聴を停止</Button>
          : <Button disabled={!prepared} onClick={() => perform({ kind: 'START_PREVIEW', musicId: 'music-01' })}>試聴する</Button>}
        <Button variant="primary" disabled={!prepared || writer !== 'OWNED' || pending}
          onClick={() => perform({ kind: 'START_GAME' })}>演奏を始める</Button>
      </div>
      <div className="trial-actions">
        {pending && <Button variant="quiet" onClick={() => navigate('RESULT')}>未保存の結果へ</Button>}
        {menuButton(navigate)}
      </div>
    </section>
  );
}

function TrialScreenView({ runtime, snapshot, navigate, perform, enableAudio }: {
  readonly runtime: TrialRuntime;
  readonly snapshot: TrialSnapshot;
  readonly navigate: Navigate;
  readonly perform: Perform;
  readonly enableAudio: () => void;
}) {
  switch (snapshot.screen) {
    case 'TITLE':
      return (
        <section className="trial-panel trial-intro">
          <Heading>リズムファクトリー</Heading>
          <p>試験曲「回転灯」で、音源・時計・入力・保存の連携を確認します。</p>
          <Button variant="primary" onClick={() => navigate('MENU')}>メニューへ</Button>
        </section>
      );
    case 'MENU':
      return (
        <section className="trial-panel">
          <Heading>メニュー</Heading>
          <nav className="trial-choice-grid" aria-label="メインメニュー">
            <Button className="trial-menu-button" variant="primary" onClick={() => navigate('MUSIC_SELECT')}>曲を選ぶ</Button>
            <Button className="trial-menu-button" onClick={() => navigate('TUTORIAL')}>練習</Button>
            <Button className="trial-menu-button" onClick={() => navigate('SETTINGS')}>設定</Button>
            <Button className="trial-menu-button" onClick={() => navigate('COLLECTION')}>コレクション</Button>
          </nav>
          {snapshot.pending && <div><Button variant="quiet" onClick={() => navigate('RESULT')}>未保存の結果へ</Button></div>}
        </section>
      );
    case 'MUSIC_SELECT':
      return <MusicView snapshot={snapshot} navigate={navigate} perform={perform} />;
    case 'TUTORIAL':
      return (
        <section className="trial-panel">
          <Heading>練習</Heading>
          <p>回転灯 · 試験譜面。練習完了だけを保存対象とします。</p>
          <div className="trial-actions">
            <Button onClick={() => runtime.prepareTutorial()}>練習音源を準備</Button>
            <Button variant="primary" disabled={!snapshot.prepared || snapshot.writer !== 'OWNED'}
              onClick={() => perform({ kind: 'START_TUTORIAL', tutorialId: 'TUT-01' })}>練習を始める</Button>
            {menuButton(navigate)}
          </div>
        </section>
      );
    case 'GAME':
    case 'PAUSE':
      return <PlayView runtime={runtime} snapshot={snapshot} perform={perform} />;
    case 'RESULT':
      return <ResultView snapshot={snapshot} perform={perform} navigate={navigate} />;
    case 'SETTINGS':
      return <SettingsView snapshot={snapshot} perform={perform} navigate={navigate} enableAudio={enableAudio} />;
    case 'CALIBRATION':
      return <CalibrationView runtime={runtime} snapshot={snapshot} perform={perform} />;
    case 'COLLECTION':
      return <CollectionView snapshot={snapshot} navigate={navigate} />;
  }
}

export function TrialGame({ runtime }: { readonly runtime: TrialRuntime }) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [actionError, setActionError] = useState<ErrorCode | null>(null);
  const actionId = useRef(0);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.querySelector<HTMLElement>('#trial-title')?.focus();
  }, [snapshot.screen]);

  function run(operation: Promise<{ readonly ok: true } | { readonly ok: false; readonly error: { readonly code: ErrorCode } }>) {
    const current = ++actionId.current;
    setActionError(null);
    void operation.then(result => {
      if (current === actionId.current && !result.ok) setActionError(result.error.code);
    }, () => {
      if (current === actionId.current) setActionError('ERR-017');
    });
  }

  function navigate(screen: TrialScreen) {
    actionId.current++;
    setActionError(runtime.navigate(screen) ? null : 'ERR-008');
  }

  const canSave = snapshot.writer === 'OWNED';
  const errorCode = snapshot.ui.error?.code ?? actionError;
  return (
    <div className="trial-shell">
      <header className="trial-header">
        {snapshot.screen !== 'TITLE' && <span className="trial-brand">リズムファクトリー</span>}
        <span className="trial-stage">A-2d 技術実証版</span>
        <span className="trial-writer" data-owner={canSave}>{canSave ? '保存可能' : '閲覧専用'}</span>
      </header>
      <main className="trial-content" aria-labelledby="trial-title" ref={main}
        data-screen={snapshot.screen} data-state={snapshot.ui.state} data-writer={snapshot.writer}
        data-save-status={snapshot.ui.saveStatus} data-error={errorCode ?? undefined}
        data-mode={snapshot.mode ?? undefined} data-generation={snapshot.generation ?? undefined}>
        {errorCode && <p className="trial-message" role="alert" data-level="error">{errors[errorCode]} <small>{errorCode}</small></p>}
        <TrialScreenView runtime={runtime} snapshot={snapshot} navigate={navigate}
          perform={command => run(runtime.dispatch(command))} enableAudio={() => run(runtime.prepareAudio())} />
      </main>
    </div>
  );
}
