// PRODUCTION environment

export const environment = {
  production: true,
  envName: 'production',

  apiBaseUrl: 'http://api.erp.renewgroups.com:8080/api/',
  disableDevTools: false,
  rememberMeKey: 'zelora_remember_me',

  /** Laravel Reverb (WebSockets) - live telephony events. Same app key as REVERB_APP_KEY in the backend .env (public;
   *  the secret stays on the server). Unreachable = the app keeps polling the API. */
  reverb: {
    key: "idd8qmlzp4wkqbartpuf",
    host: "api.erp.renewgroups.com",
    port: 6001,
    scheme: "http" as "http" | "https",
  },
};
