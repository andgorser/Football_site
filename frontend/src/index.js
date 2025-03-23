import React from 'react';
import { createRoot } from 'react-dom/client'; // Новый импорт
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container); // Создаем корень
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);