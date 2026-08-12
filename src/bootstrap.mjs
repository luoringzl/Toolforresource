import { createBrowserAPI } from './services/browser-api.mjs';
import { localDateKey } from './utils/date.mjs';

const hasDesktopAPI=Boolean(window.desktopAPI);
if (!hasDesktopAPI) window.desktopAPI = createBrowserAPI();
window.projectResourceRuntime = Object.freeze({
  platform: hasDesktopAPI ? 'desktop' : 'browser',
  localDateKey
});

await import('./app.mjs');
