// Boot entry. Task 1.1 skeleton: mounts a placeholder App; the full boot path
// (BootGate, GameRuntime, load-failure handling) is implemented in task 14.3.
import '@fontsource-variable/inter';
import '../index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const boot = document.getElementById('boot-status');
  if (boot) boot.textContent = '';
}
