import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { PreferencesProvider } from './context/PreferencesContext';
import './styles/tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
);
