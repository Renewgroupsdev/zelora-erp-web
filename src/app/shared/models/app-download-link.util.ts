export type DevicePlatform = 'android' | 'ios' | 'other';

export function detectPlatform(userAgent: string): DevicePlatform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'other';
}

export interface AppDownloadLink {
  url: string;
  label: string;
  icon: string;
}

/** Picks the right store link for the device that's viewing the page. A real Play Store /
 *  App Store https link already does the right native-app-vs-browser fallback on its own
 *  (opens the store app if installed, otherwise the store's own web page in Chrome/Safari) -
 *  so there's nothing custom to do there, we just need to point at the correct one. Falls
 *  back to whichever link *is* configured when the device/URL for that platform is missing. */
export function resolveAppDownloadLink(
  platform: DevicePlatform,
  playstoreUrl: string | null | undefined,
  appstoreUrl: string | null | undefined,
): AppDownloadLink | null {
  const playstore = playstoreUrl?.trim() || null;
  const appstore = appstoreUrl?.trim() || null;

  if (platform === 'ios' && appstore) {
    return { url: appstore, label: 'Download on the App Store', icon: 'bi-apple' };
  }
  if (platform === 'android' && playstore) {
    return { url: playstore, label: 'Get it on Google Play', icon: 'bi-google-play' };
  }

  // Wrong-platform link, or desktop - offer whatever is configured rather than nothing.
  if (playstore) {
    return { url: playstore, label: 'Get it on Google Play', icon: 'bi-google-play' };
  }
  if (appstore) {
    return { url: appstore, label: 'Download on the App Store', icon: 'bi-apple' };
  }

  return null;
}
