import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as QRCode from 'qrcode';
import { NavLayoutService } from '../../services/nav-layout.service';
import { IdleService } from '../../core/idle-service/idle.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { BranchOptionsService, parseUnitKey } from '../../shared/common-services/branch-options.service';
import { ToastService } from '../../shared/common-services/toast.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage implements OnInit {
  readonly idlePresets = [5, 15, 30, 60];
  /** Branches + franchises the QR can be generated for (key "branch:9" / "franchise:7" is the dropdown value). */
  readonly branchOptions = inject(BranchOptionsService);

  constructor(
    public navLayout: NavLayoutService,
    public idleService: IdleService,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  // App download links
  playstoreUrl = '';
  appstoreUrl = '';
  savingStoreUrls = false;

  // Lead form URL (base URL the mobile app opens when it scans a branch QR)
  leadFormUrl = '';
  savingLeadFormUrl = false;

  // Public App URL - what the QR itself points at (our own /scan page). Explicit and
  // saved, instead of trusting window.location.origin, because generating the QR from an
  // admin browser open on "localhost" would otherwise bake in an address no phone can reach.
  appBaseUrl = '';
  savingAppBaseUrl = false;

  // Branch / franchise QR code
  loadingBranches = false;
  selectedBranchKey: string | null = null;
  generatingQr = false;
  qrDataUrl: string | null = null;
  qrTargetUrl: string | null = null;

  ngOnInit(): void {
    this.loadSettings();
    this.loadBranches();
  }

  setIdleMinutes(minutes: number): void {
    if (minutes > 0) {
      this.idleService.setIdleMinutes(minutes);
    }
  }

  private loadSettings(): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        const settings = response?.success ? response.data : {};
        this.playstoreUrl = settings?.playstore_url ?? '';
        this.appstoreUrl = settings?.appstore_url ?? '';
        this.leadFormUrl = settings?.leadform_url ?? '';
        this.appBaseUrl = settings?.app_base_url ?? '';
      },
      error: (err: any) => {
        console.error('Failed to load settings:', err);
      },
    });
  }

  /** What the QR actually gets built against: the saved Public App URL if set, otherwise
   *  wherever this page itself happens to be open right now. */
  get effectiveAppOrigin(): string {
    return this.appBaseUrl.trim().replace(/\/+$/, '') || window.location.origin;
  }

  /** "localhost"/127.0.0.1 only ever means the device itself - a QR built against either
   *  will never open on a phone, no matter how it's reached. */
  get originLooksLocal(): boolean {
    try {
      const host = new URL(this.effectiveAppOrigin).hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  }

  saveAppBaseUrl(): void {
    this.savingAppBaseUrl = true;
    const payload = { settings: { app_base_url: this.appBaseUrl.trim() } };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingAppBaseUrl = false;
        if (response?.success !== false) {
          this.toast.success('Public App URL saved');
        } else {
          this.toast.error(response?.message || 'Failed to save Public App URL.');
        }
      },
      error: (err: any) => {
        this.savingAppBaseUrl = false;
        this.toast.error(err?.error?.message || 'Failed to save Public App URL.');
        console.error('Failed to save Public App URL:', err);
      },
    });
  }

  saveStoreUrls(): void {
    this.savingStoreUrls = true;
    const payload = {
      settings: {
        playstore_url: this.playstoreUrl.trim(),
        appstore_url: this.appstoreUrl.trim(),
      },
    };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingStoreUrls = false;
        if (response?.success !== false) {
          this.toast.success('App store links saved');
        } else {
          this.toast.error(response?.message || 'Failed to save app store links.');
        }
      },
      error: (err: any) => {
        this.savingStoreUrls = false;
        this.toast.error(err?.error?.message || 'Failed to save app store links.');
        console.error('Failed to save app store links:', err);
      },
    });
  }

  saveLeadFormUrl(): void {
    this.savingLeadFormUrl = true;
    const payload = { settings: { leadform_url: this.leadFormUrl.trim() } };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingLeadFormUrl = false;
        if (response?.success !== false) {
          this.toast.success('Lead form URL saved');
        } else {
          this.toast.error(response?.message || 'Failed to save lead form URL.');
        }
      },
      error: (err: any) => {
        this.savingLeadFormUrl = false;
        this.toast.error(err?.error?.message || 'Failed to save lead form URL.');
        console.error('Failed to save lead form URL:', err);
      },
    });
  }

  private loadBranches(): void {
    this.loadingBranches = true;
    this.branchOptions.load().subscribe({
      next: (options) => {
        this.loadingBranches = false;
        if (!this.selectedBranchKey && options.length) {
          this.selectedBranchKey = options[0].key;
        }
      },
      error: () => {
        this.loadingBranches = false;
        this.toast.error('Failed to load branches / franchises.');
      },
    });
  }

  async generateQr(): Promise<void> {
    const unit = parseUnitKey(this.selectedBranchKey);
    if (!unit) {
      this.toast.warning('Select a branch / franchise first.');
      return;
    }

    const baseUrl = this.leadFormUrl.trim();
    if (!baseUrl) {
      this.toast.warning('Enter the lead form URL first.');
      return;
    }

    this.generatingQr = true;
    this.qrDataUrl = null;

    try {
      // The encrypted unit code (only our backend, same APP_KEY, can decrypt it back to the real code).
      const params = new URLSearchParams({ branch_type: unit.type, branch_id: String(unit.id) });
      const res: any = await firstValueFrom(this.apiDataService.GET(`${ApiRoutesConstants.QR_SCAN_TOKEN}?${params}`));
      const qrToken: string | null = res?.data?.qr_token ?? null;
      if (!qrToken) {
        this.toast.error(res?.message || 'This branch / franchise has no code yet.');
        return;
      }

      // The QR points at our own /scan page, not the lead form directly - that page logs the
      // scan (device/branch data) before handing the visitor on to the lead form URL above.
      // The token is already URL-safe (the backend urlencodes it), so it's appended as-is.
      const targetUrl = `${this.effectiveAppOrigin}/scan?code=${qrToken}`;
      this.qrTargetUrl = targetUrl;

      this.qrDataUrl = await QRCode.toDataURL(targetUrl, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to generate QR code.');
      console.error('Failed to generate QR code:', err);
    } finally {
      this.generatingQr = false;
    }
  }

  downloadQr(): void {
    if (!this.qrDataUrl) return;

    const unit = this.branchOptions.byKey(this.selectedBranchKey);
    const fileName = `qr-${unit?.code || String(this.selectedBranchKey).replace(':', '-')}.png`;

    const link = document.createElement('a');
    link.href = this.qrDataUrl;
    link.download = fileName;
    link.click();
  }
}
