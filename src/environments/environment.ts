export const environment = {
  production: false,
  envName: 'local',

  apiBaseUrl: `http://192.168.0.212:8000/api/`,
  disableDevTools: false,
  rememberMeKey: 'remember_me',

  /** Laravel Reverb (WebSockets) - live telephony events. Set key to REVERB_APP_KEY from the local backend .env;
   *  left empty, the socket stays off and the app keeps polling the API. */
  reverb: {
    key: '',
    host: '192.168.0.212',
    port: 8080,
    scheme: 'http' as 'http' | 'https',
  },
};


