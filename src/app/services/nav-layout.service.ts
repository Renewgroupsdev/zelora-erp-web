import { DOCUMENT } from '@angular/common';
import { Injectable, signal, inject, computed } from '@angular/core';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

export type NavLayoutMode = 'vertical' | 'horizontal';
export type ThemeMode = 'light' | 'dark';
export type PrimaryColor = 'green' | 'blue' | 'purple' | 'teal' | 'custom';

const PRIMARY_PRESETS: Record<Exclude<PrimaryColor, 'custom'>, string> = {
  green: '#18b875',
  blue: '#2d7ff9',
  purple: '#8b5cf6',
  teal: '#0f9f91',
};

@Injectable({
  providedIn: 'root',
})
export class NavLayoutService {
  private readonly document = inject(DOCUMENT);

  readonly sidebarExpanded = signal<boolean>(this.readBoolean('renew-plus-sidebar-expanded', true));
  readonly layoutMode = signal<NavLayoutMode>(this.readLayout());
  readonly theme = signal<ThemeMode>(this.readTheme());
  readonly primaryColor = signal<PrimaryColor>(this.readPrimaryColor());
  readonly primaryHex = signal<string>(this.readPrimaryHex());

  readonly settingsMenuOpen = signal<boolean>(false);
  readonly notificationsOpen = signal<boolean>(false);

  /**
   * `sidebarExpanded` is a persisted DESKTOP preference (full labels vs icon-only).
   * It must never double as the mobile drawer's open/closed state, otherwise the
   * drawer's visibility on phones ends up driven by whatever was last saved on
   * desktop (defaults to `true`, i.e. already "open") instead of starting closed
   * and responding to the hamburger button. Mobile gets its own transient state.
   */
  readonly mobileSidebarOpen = signal<boolean>(false);
  readonly isMobileViewport = signal<boolean>(this.readMobileViewport());

  /** What the 3-bar icon / off-canvas nav should actually key off, per viewport. */
  readonly sidebarVisible = computed(() =>
    this.isMobileViewport() ? this.mobileSidebarOpen() : this.sidebarExpanded()
  );

  constructor() {
    this.applyTheme(this.theme());
    this.applyPrimaryColor(this.primaryColor(), this.primaryHex());
    this.watchViewport();
  }

  /** Called by the top-navbar's 3-bar icon. Routes to the correct state for the current viewport. */
  toggleSidebar(): void {
    if (this.isMobileViewport()) {
      this.mobileSidebarOpen.update(open => !open);
      return;
    }

    this.sidebarExpanded.update(expanded => !expanded);
    localStorage.setItem('renew-plus-sidebar-expanded', String(this.sidebarExpanded()));
  }

  setSidebarExpanded(expanded: boolean): void {
    this.sidebarExpanded.set(expanded);
    localStorage.setItem('renew-plus-sidebar-expanded', String(expanded));
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  toggleSettingsMenu(): void {
    this.settingsMenuOpen.update(open => !open);
    this.notificationsOpen.set(false);
  }

  closeSettingsMenu(): void {
    this.settingsMenuOpen.set(false);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update(open => !open);
    this.settingsMenuOpen.set(false);
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  setLayoutMode(mode: NavLayoutMode): void {
    this.layoutMode.set(mode);
    localStorage.setItem('renew-plus-layout', mode);
  }

  setTheme(theme: ThemeMode): void {
    this.theme.set(theme);
    this.applyTheme(theme);
    this.applyPrimaryColor(this.primaryColor(), this.primaryHex());
    localStorage.setItem('renew-plus-theme', theme);
  }

  setPrimaryColor(color: PrimaryColor): void {
    this.primaryColor.set(color);
    const hex = color === 'custom' ? this.primaryHex() : PRIMARY_PRESETS[color];
    this.primaryHex.set(hex);
    this.applyPrimaryColor(color, hex);
    localStorage.setItem('renew-plus-primary', color);
    localStorage.setItem('renew-plus-primary-hex', hex);
  }

  setCustomPrimaryColor(hex: string): void {
    const normalizedHex = this.normalizeHex(hex);
    if (!normalizedHex) {
      return;
    }

    this.primaryColor.set('custom');
    this.primaryHex.set(normalizedHex);
    this.applyPrimaryColor('custom', normalizedHex);
    localStorage.setItem('renew-plus-primary', 'custom');
    localStorage.setItem('renew-plus-primary-hex', normalizedHex);
  }

  private readLayout(): NavLayoutMode {
    return localStorage.getItem('renew-plus-layout') === 'horizontal' ? 'horizontal' : 'vertical';
  }

  private readTheme(): ThemeMode {
    return localStorage.getItem('renew-plus-theme') === 'dark' ? 'dark' : 'light';
  }

  private readPrimaryColor(): PrimaryColor {
    const value = localStorage.getItem('renew-plus-primary');
    return value === 'blue' || value === 'purple' || value === 'teal' || value === 'custom' ? value : 'green';
  }

  private readPrimaryHex(): string {
    const color = this.primaryColor();
    const savedHex = this.normalizeHex(localStorage.getItem('renew-plus-primary-hex') ?? '');
    if (color === 'custom' && savedHex) {
      return savedHex;
    }

    if (color === 'custom') {
      return PRIMARY_PRESETS.green;
    }

    return PRIMARY_PRESETS[color];
  }

  private readMobileViewport(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
  }

  private watchViewport(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handleChange = (event: MediaQueryList | MediaQueryListEvent): void => {
      this.isMobileViewport.set(event.matches);
      // Leaving mobile (e.g. rotating / resizing to desktop) should close the drawer
      // so it doesn't reappear as a full-screen overlay next time the viewport shrinks.
      if (!event.matches) {
        this.mobileSidebarOpen.set(false);
      }
    };

    mql.addEventListener('change', handleChange);
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  }

  private applyTheme(theme: ThemeMode): void {
    this.document.documentElement.dataset['theme'] = theme;
  }

  private applyPrimaryColor(color: PrimaryColor, hex: string): void {
    const root = this.document.documentElement;
    root.dataset['primary'] = color;
    const customProperties = ['--primary', '--primary-dark', '--primary-soft', '--primary-soft-strong', '--primary-border', '--primary-border-strong', '--primary-shadow'];
    if (color === 'custom') {
      const rgb = this.hexToRgb(hex);
      const surface = this.theme() === 'dark' ? '#172825' : 'white';
      root.style.setProperty('--primary', hex);
      root.style.setProperty('--primary-dark', `rgb(${Math.round(rgb.r * 0.78)}, ${Math.round(rgb.g * 0.78)}, ${Math.round(rgb.b * 0.78)})`);
      root.style.setProperty('--primary-soft', `color-mix(in srgb, ${hex} 12%, ${surface})`);
      root.style.setProperty('--primary-soft-strong', `color-mix(in srgb, ${hex} 20%, ${surface})`);
      root.style.setProperty('--primary-border', `color-mix(in srgb, ${hex} 18%, transparent)`);
      root.style.setProperty('--primary-border-strong', `color-mix(in srgb, ${hex} 38%, transparent)`);
      root.style.setProperty('--primary-shadow', `color-mix(in srgb, ${hex} 24%, transparent)`);
    } else {
      customProperties.forEach(property => root.style.removeProperty(property));
    }
  }

  private normalizeHex(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }

    if (/^#[0-9a-f]{3}$/.test(normalized)) {
      return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    }

    return null;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
}
