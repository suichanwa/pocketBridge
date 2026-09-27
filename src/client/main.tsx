import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event?.reason?.message || String(event?.reason || '');
    if (
      msg.toLowerCase().includes('failed to fetch') ||
      msg.toLowerCase().includes('load failed') ||
      msg.toLowerCase().includes('network')
    ) {
      event.preventDefault();
      console.warn('Suppressed transient network unhandled rejection:', msg);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
