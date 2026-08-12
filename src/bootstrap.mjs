import { createBrowserAPI } from './services/browser-api.mjs';
import { localDateKey } from './utils/date.mjs';

if (!window.desktopAPI) window.desktopAPI = createBrowserAPI();
window.projectResourceRuntime = Object.freeze({
  platform: window.desktopAPI ? (window.desktopAPI === globalThis.desktopAPI ? 'desktop' : 'browser') : 'browser',
  localDateKey
});

await import('./app.mjs');
