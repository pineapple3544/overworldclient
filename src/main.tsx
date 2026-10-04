import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
try {
  const theme = localStorage.getItem('overworld-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  /* Use the default dark palette until settings load. */
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
