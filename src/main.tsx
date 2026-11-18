import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/workshop.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Deskling root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
