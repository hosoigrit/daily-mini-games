import type { Lane, RenderNote, RenderSnapshot, Us } from '../contracts/interface_contracts';
import type { RenderPort } from '../contracts/ports';

const lanes: readonly Lane[] = [1, 2, 3, 4];
const judgeLineRatio = 0.8;
const pixelsPerMicrosecond = 0.00032;
const noteColors: Record<RenderNote['type'], string> = {
  TAP: '#9cf2d7',
  HOLD: '#a4c9ff',
  CHORD: '#ffc477',
  RAPID: '#f6b0d3',
};

export function trialNoteY(targetUs: Us, judgeUs: Us, linePx: number, noteSpeed: number): number {
  return linePx - pixelsPerMicrosecond * noteSpeed * (targetUs - judgeUs);
}

interface Viewport {
  readonly width: number;
  readonly height: number;
}

interface Marker {
  readonly note: RenderNote;
  readonly x: number;
  readonly y: number;
}

function noteAlpha(note: RenderNote): number {
  if (note.state === 'PENDING') return 1;
  if (note.judgement === 'MISS') return 0.38;
  return note.state === 'RESOLVED' ? 0.85 : 0.58;
}

function paintMarker(context: CanvasRenderingContext2D, { note, x, y }: Marker, width: number): void {
  const halfWidth = width / 2;
  const isHoldEnd = note.type === 'HOLD' && note.targetUs === note.endUs;
  const height = isHoldEnd ? 16 : 24;
  const left = x - halfWidth;
  const top = y - height / 2;
  context.globalAlpha = noteAlpha(note);
  context.fillStyle = noteColors[note.type];
  context.beginPath();
  switch (note.type) {
    case 'TAP':
      context.roundRect(left, top, width, height, height / 2);
      break;
    case 'HOLD':
      context.roundRect(left + 4, top, width - 8, height, 3);
      break;
    case 'CHORD':
      context.moveTo(left, y);
      context.lineTo(left + 10, top);
      context.lineTo(x + halfWidth - 10, top);
      context.lineTo(x + halfWidth, y);
      context.lineTo(x + halfWidth - 10, top + height);
      context.lineTo(left + 10, top + height);
      context.closePath();
      break;
    case 'RAPID':
      context.roundRect(left, top + 2, width, height - 4, 2);
      break;
  }
  context.fill();

  context.fillStyle = '#0d171b';
  if (note.type === 'RAPID' && width >= 42) {
    // Three short bars also distinguish a rapid strike when color is unavailable.
    for (const step of [0, 3, 6]) context.fillRect(left + 6 + step, y - 4, 1.5, 8);
  }
  const label = isHoldEnd ? 'END' : note.type;
  const rapidLabelOffset = note.type === 'RAPID' && width >= 42 ? 5 : 0;
  context.fillText(label, x + rapidLabelOffset, y, width - 14 - rapidLabelOffset * 2);
  context.globalAlpha = 1;
}

function paintField(context: CanvasRenderingContext2D, viewport: Viewport, snapshot: RenderSnapshot): void {
  const { width, height } = viewport;
  const laneWidth = width / lanes.length;
  const lineY = height * judgeLineRatio;
  const markerWidth = Math.min(88, laneWidth * 0.76);

  context.fillStyle = '#0d171b';
  context.fillRect(0, 0, width, height);
  for (const lane of lanes) {
    const left = laneWidth * (lane - 1);
    const holding = snapshot.activeHoldLanes.includes(lane);
    context.fillStyle = holding ? '#244451' : snapshot.pressedLanes.includes(lane) ? '#20393f' : lane % 2 ? '#122127' : '#17292f';
    context.fillRect(left, 0, laneWidth, height);
    if (lane === 1) continue;
    context.fillStyle = lane === 3 ? '#526973' : '#2e4148';
    context.fillRect(left, 0, lane === 3 ? 2 : 1, height);
  }
  context.fillStyle = '#203639';
  context.fillRect(0, lineY, width, height - lineY);

  const markers: Marker[] = [];
  const chordStarts = new Map<string, number>();
  const yFor = (timeUs: Us) => trialNoteY(timeUs, snapshot.judgeTimeUs, lineY, snapshot.noteSpeed);
  for (const note of snapshot.notes) {
    const x = laneWidth * (note.lane - 0.5);
    const y = yFor(note.targetUs);
    if (note.type === 'HOLD' && note.endUs !== null && note.targetUs < note.endUs) {
      const top = Math.max(0, yFor(note.endUs));
      const bottom = Math.min(height, y);
      if (top < bottom) {
        context.fillStyle = note.judgement === 'MISS' ? '#435767' : '#5c82aa';
        context.fillRect(x - 8, top, 16, bottom - top);
        context.fillStyle = '#c5daf2';
        context.fillRect(x - 1, top, 2, bottom - top);
      }
    }
    if (y < -12 || y > height + 12) continue;
    markers.push({ note, x, y });
    if (note.type !== 'CHORD') continue;
    const chordKey = `${note.noteId}:${note.targetUs}`;
    const otherX = chordStarts.get(chordKey);
    if (otherX === undefined) {
      chordStarts.set(chordKey, x);
    } else {
      context.fillStyle = '#ffc477';
      context.fillRect(Math.min(x, otherX), y - 2, Math.abs(x - otherX), 4);
    }
  }

  context.fillStyle = '#f7f9ed';
  context.fillRect(0, lineY - 1, width, 3);
  if (markerWidth <= 24) return;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 10px system-ui, sans-serif';
  for (const marker of markers) paintMarker(context, marker, markerWidth);
}

export function mountTrialCanvas(
  canvas: HTMLCanvasElement,
  render: RenderPort,
  onFrame?: (atMs: number) => void,
): () => void {
  const view = canvas.ownerDocument.defaultView;
  const context = canvas.getContext('2d');
  if (!view || !context) return () => {};

  let active = true;
  let needsMeasure = true;
  let dpr = 0;
  let viewport: Viewport | null = null;
  const markForMeasure = () => { needsMeasure = true; };
  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(markForMeasure) : null;
  observer?.observe(canvas);
  view.addEventListener('resize', markForMeasure);

  const measure = (scale: number) => {
    needsMeasure = false;
    dpr = scale;
    const { width, height } = canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
      viewport = null;
      return;
    }
    const backingWidth = Math.max(1, Math.round(width * scale));
    const backingHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0);
    viewport = { width, height };
  };

  const draw = (atMs: number) => {
    if (!active) return;
    const currentDpr = Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    if (needsMeasure || dpr !== currentDpr) measure(currentDpr);
    if (viewport) {
      paintField(context, viewport, render.getRenderSnapshot());
      onFrame?.(atMs);
    }
    if (active) frameId = view.requestAnimationFrame(draw);
  };
  let frameId = view.requestAnimationFrame(draw);

  return () => {
    if (!active) return;
    active = false;
    view.cancelAnimationFrame(frameId);
    view.removeEventListener('resize', markForMeasure);
    observer?.disconnect();
  };
}
