import type { RenderPort } from '../contracts/ports';

export function mountCanvasRenderer(canvas: HTMLCanvasElement, render: RenderPort): () => void {
  const view = canvas.ownerDocument.defaultView;
  const context = canvas.getContext('2d');
  if (!view || !context) return () => {};

  let active = true;

  const paint = () => {
    const { progress } = render.getRenderSnapshot();
    const { width, height } = canvas;
    context.fillStyle = '#eff5f2';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1d6957';
    context.fillRect(12, height / 2 - 2, 12 + (width - 36) * progress, 4);
  };

  const draw = () => {
    if (!active) return;
    paint();
    frameId = view.requestAnimationFrame(draw);
  };

  let frameId = view.requestAnimationFrame(draw);
  const onResize = () => { if (active) paint(); };
  view.addEventListener('resize', onResize);

  return () => {
    if (!active) return;
    active = false;
    view.cancelAnimationFrame(frameId);
    view.removeEventListener('resize', onResize);
  };
}
