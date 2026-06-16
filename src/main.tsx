import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { getPref } from './lib/prefs';
import './index.css';

// Apply theme before first render to avoid flash
document.documentElement.setAttribute(
  'data-theme',
  getPref('DARK_MODE') === 'true' ? 'dark' : 'light'
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
