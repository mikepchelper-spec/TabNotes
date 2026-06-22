import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '@tabnotes/ui';
import App from './App';
import './index.css';
import { initI18n, resolveLanguage } from '@tabnotes/i18n';

// Synchronous fallback init; corrected on load from storage/localStorage
initI18n(resolveLanguage(navigator.language));

const routerBaseName = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="app">
      <BrowserRouter
        basename={routerBaseName}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .catch(() => undefined);
  });
}
