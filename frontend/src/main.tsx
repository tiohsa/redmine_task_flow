import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

function mountTaskFlow() {
  const container = document.getElementById('redmine-task-flow-root');
  if (!container) return;

  const bootstrapUrl = container.dataset.bootstrapUrl ?? '';
  const bulkCreateUrl = container.dataset.bulkCreateUrl ?? '';

  if (!bootstrapUrl || !bulkCreateUrl) {
    container.textContent =
      'Task Flow configuration error: missing bootstrap/bulk_create URL.';
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App bootstrapUrl={bootstrapUrl} bulkCreateUrl={bulkCreateUrl} />
    </React.StrictMode>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountTaskFlow);
} else {
  mountTaskFlow();
}
