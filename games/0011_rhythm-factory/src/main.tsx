import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createTrialRuntime } from './bootstrap/trial-runtime';
import { TrialGame } from './presentation/TrialGame';

const element = document.getElementById('root');
if (!element) throw new Error('Missing application root');

const runtime = createTrialRuntime(window);
const root = createRoot(element);
root.render(<StrictMode><TrialGame runtime={runtime} /></StrictMode>);

function dispose() {
  window.removeEventListener('pagehide', unload);
  root.unmount();
  runtime.dispose();
}

function unload(event: PageTransitionEvent) {
  if (!event.persisted) dispose();
}

window.addEventListener('pagehide', unload);
if (import.meta.hot) import.meta.hot.dispose(dispose);
