import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';


@Injectable({ providedIn: 'root' })
export class DevToolsGuardService {

  private initialized = false;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private warningBanner: HTMLElement | null = null;

  private readonly openThresholdPx = 160;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key?.toUpperCase();

    const isF12 = key === 'F12';
    const isViewSource = event.ctrlKey && !event.shiftKey && key === 'U';
    const isDevToolsCombo =
      event.ctrlKey && event.shiftKey && ['I', 'J', 'C'].includes(key);

    if (isF12 || isViewSource || isDevToolsCombo) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

    /** Initializes the dev tools guard. */
  init(options: { blockRightClick?: boolean; showOpenWarning?: boolean } = {}): void {
    const { blockRightClick = true, showOpenWarning = true } = options;

    if (this.initialized || typeof window === 'undefined') {
      return;
    }

    if (!environment.disableDevTools) {
      return;
    }

    document.addEventListener('keydown', this.onKeyDown, true);

    if (blockRightClick) {
      document.addEventListener('contextmenu', this.onContextMenu);
    }

    if (showOpenWarning) {
      this.pollHandle = setInterval(() => this.checkDevToolsOpen(), 1000);
    }

    this.initialized = true;
  }

  /** Removes all listeners/timers set up by init(). */
  destroy(): void {
    if (!this.initialized) {
      return;
    }

    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('contextmenu', this.onContextMenu);

    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }

    this.hideWarningBanner();
    this.initialized = false;
  }

  private checkDevToolsOpen(): void {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    const looksOpen = widthGap > this.openThresholdPx || heightGap > this.openThresholdPx;

    if (looksOpen) {
      this.showWarningBanner();
    } else {
      this.hideWarningBanner();
    }
  }

  private showWarningBanner(): void {
    if (this.warningBanner) {
      return;
    }

    const banner = document.createElement('div');
    banner.textContent =
      'Developer tools appear to be open. Please close them to continue using this application securely.';
    banner.setAttribute('role', 'alert');
    Object.assign(banner.style, {
      position: 'fixed',
      insetInline: '0',
      top: '0',
      zIndex: '2147483647',
      padding: '10px 16px',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      color: '#7a1f1f',
      background: '#fdecea',
      borderBottom: '1px solid #f3b8b8',
    } as CSSStyleDeclaration);

    document.body.appendChild(banner);
    this.warningBanner = banner;
  }

  private hideWarningBanner(): void {
    if (this.warningBanner) {
      this.warningBanner.remove();
      this.warningBanner = null;
    }
  }
}