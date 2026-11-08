import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { AppErrorBoundary } from './components/Common/AppErrorBoundary.tsx';
import { installGlobalErrorLogging } from './core/utils/runtimeErrorLog.ts';
import './index.css';

installGlobalErrorLogging();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
