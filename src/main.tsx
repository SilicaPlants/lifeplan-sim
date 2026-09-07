import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { warmUpDownloads } from './lib/download';
import './styles.css';

// Artifact 上ではファイル保存の可否の確認に時間がかかるため、先に問い合わせておく
warmUpDownloads();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
