import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameStorePort } from '../contracts/ports';
import './foundation.css';

interface FoundationScreenProps {
  readonly store: GameStorePort;
  readonly toggleProbeState: () => void;
  readonly mountCanvas: (canvas: HTMLCanvasElement) => () => void;
}

export function FoundationScreen({ store, toggleProbeState, mountCanvas }: FoundationScreenProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvas.current) return mountCanvas(canvas.current);
  }, [mountCanvas]);

  return (
    <main aria-labelledby="foundation-title">
      <h1 id="foundation-title">リズムファクトリー</h1>
      <p>開発基盤の動作確認</p>
      <canvas ref={canvas} width={360} height={68} aria-label="描画ループの確認" />
      <p role="status">テスト状態 {snapshot.state}</p>
      <button type="button" onClick={toggleProbeState}>テスト状態を切り替える</button>
    </main>
  );
}
