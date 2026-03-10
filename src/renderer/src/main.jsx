import React from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './App.jsx';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  // Last resort to surface a startup issue
  document.body.innerText = 'Root element not found';
} else {
  window.addEventListener('error', (event) => {
    rootEl.innerHTML = `<pre style="padding:16px;color:#b91c1c;">${event.message}</pre>`;
  });
  window.addEventListener('unhandledrejection', (event) => {
    rootEl.innerHTML = `<pre style="padding:16px;color:#b91c1c;">${event.reason}</pre>`;
  });

  console.log('Renderer booting');
  rootEl.setAttribute('data-boot', 'true');
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
