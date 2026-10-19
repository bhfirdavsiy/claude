import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setAssetBase } from './remotion/assets';
import './styles.css';

setAssetBase(import.meta.env.BASE_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
