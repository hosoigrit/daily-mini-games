import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createCompositionRoot } from '../../../../src/app/composition-root';
import { mountCanvasRenderer } from '../../../../src/infrastructure/canvas-renderer';
import { FoundationScreen } from '../../../../src/presentation/FoundationScreen';

const element = document.getElementById('root');
if (!element) throw new Error('Missing application root');

const services = createCompositionRoot();
const root = createRoot(element);
const mountCanvas = (canvas: HTMLCanvasElement) => mountCanvasRenderer(canvas, services.render);

root.render(
  <StrictMode>
    <FoundationScreen store={services.store} toggleProbeState={services.toggleProbeState} mountCanvas={mountCanvas} />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    services.dispose();
  });
}
