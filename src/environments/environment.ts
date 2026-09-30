// LOCAL / DEVELOPMENT environment

// Derived from whatever host actually loaded this page - localhost, 127.0.0.1, or a LAN IP
// like 192.168.x.x - instead of a hardcoded value. A phone scanning a QR code opens the app
// via the dev machine's LAN IP, and "127.0.0.1" on that phone means the phone itself, not the
// dev machine, so every API call would silently fail no matter how many times that constant
// gets hand-edited back and forth. Backend must be reachable on port 8000 at that same host.
const apiHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  envName: 'local',

  apiBaseUrl: `http://${apiHost}:8000/api/`,
  disableDevTools: false,
  rememberMeKey: 'remember_me',
};
